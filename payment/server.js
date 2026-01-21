// payment/server.js - Stripe Payment Service
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
app.use(express.json());

// Database Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ==================== PAYMENT INTENTS ====================

// Create Payment Intent for Voucher
app.post('/api/payment/create-intent', async (req, res) => {
  try {
    const { amount, voucherId, email, description } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: email,
      metadata: {
        voucherId,
        type: 'voucher_purchase',
      },
      description: description || `Hotspot Voucher Purchase`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== WEBHOOK HANDLER ====================

// Stripe Webhook Signature Verification
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PAYMENT HANDLERS ====================

async function handlePaymentSuccess(paymentIntent) {
  const { voucherId } = paymentIntent.metadata;

  try {
    // Update voucher as paid
    await pool.query(
      'UPDATE vouchers SET status = $1, paid = true WHERE id = $2',
      ['active', voucherId]
    );

    // Create payment record
    await pool.query(
      `INSERT INTO payments (amount, currency, status, payment_method, transaction_id, stripe_payment_id, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        paymentIntent.amount / 100,
        paymentIntent.currency,
        'completed',
        paymentIntent.payment_method,
        paymentIntent.id,
        paymentIntent.id,
        `Voucher ${voucherId} Payment`,
      ]
    );

    // Get voucher details for notification
    const voucherResult = await pool.query(
      'SELECT code, email FROM vouchers v LEFT JOIN users u ON v.created_by = u.id WHERE v.id = $1',
      [voucherId]
    );

    if (voucherResult.rows.length > 0) {
      const voucher = voucherResult.rows[0];
      await notifyPaymentSuccess(voucher.email, voucher.code);
    }

    console.log(`Payment successful for voucher ${voucherId}`);
  } catch (error) {
    console.error('Error handling payment success:', error);
    throw error;
  }
}

async function handlePaymentFailed(paymentIntent) {
  const { voucherId } = paymentIntent.metadata;

  try {
    // Create failed payment record
    await pool.query(
      `INSERT INTO payments (amount, currency, status, payment_method, transaction_id, stripe_payment_id, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        paymentIntent.amount / 100,
        paymentIntent.currency,
        'failed',
        paymentIntent.payment_method || 'unknown',
        paymentIntent.id,
        paymentIntent.id,
        `Voucher ${voucherId} Payment - Failed`,
      ]
    );

    console.log(`Payment failed for voucher ${voucherId}`);
  } catch (error) {
    console.error('Error handling payment failure:', error);
    throw error;
  }
}

async function handleRefund(charge) {
  try {
    const stripePyamentId = charge.payment_intent;

    // Find related payment
    const paymentResult = await pool.query(
      'SELECT * FROM payments WHERE stripe_payment_id = $1',
      [stripePyamentId]
    );

    if (paymentResult.rows.length > 0) {
      const payment = paymentResult.rows[0];

      // Update payment status
      await pool.query(
        'UPDATE payments SET status = $1 WHERE id = $2',
        ['refunded', payment.id]
      );

      // Deactivate related voucher
      await pool.query(
        'UPDATE vouchers SET status = $1 WHERE id = (SELECT id FROM payments WHERE stripe_payment_id = $2)',
        ['inactive', stripePyamentId]
      );

      console.log(`Refund processed for payment ${payment.id}`);
    }
  } catch (error) {
    console.error('Error handling refund:', error);
    throw error;
  }
}

// ==================== PAYMENT NOTIFICATIONS ====================

async function notifyPaymentSuccess(email, voucherCode) {
  try {
    // Send notification via API to backend
    await axios.post(`${process.env.API_URL}/api/notify/email`, {
      email,
      subject: 'Payment Confirmed - Voucher Activated',
      html: `
        <h2>Payment Confirmed!</h2>
        <p>Your payment has been successfully processed.</p>
        <p><strong>Voucher Code:</strong> ${voucherCode}</p>
        <p>Your voucher is now active and ready to use.</p>
        <p>Thank you for your purchase!</p>
      `,
    });
  } catch (error) {
    console.error('Error sending payment notification:', error);
  }
}

// ==================== PAYMENT HISTORY ====================

app.get('/api/payment/history', async (req, res) => {
  try {
    const { userId } = req.query;

    const query = userId
      ? 'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50'
      : 'SELECT * FROM payments ORDER BY created_at DESC LIMIT 100';

    const params = userId ? [userId] : [];
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PAYMENT DETAILS ====================

app.get('/api/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment from database
    const paymentResult = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Get details from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripe_payment_id
    );

    res.json({
      ...payment,
      stripeDetails: paymentIntent,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== REFUND HANDLING ====================

app.post('/api/payment/refund', async (req, res) => {
  try {
    const { paymentId, reason } = req.body;

    // Get payment details
    const paymentResult = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Process refund with Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_id,
      reason: reason || 'requested_by_customer',
    });

    res.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INVOICE GENERATION ====================

app.post('/api/payment/invoice', async (req, res) => {
  try {
    const { paymentId, recipientEmail } = req.body;

    // Get payment details
    const paymentResult = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    const invoiceContent = `
      <html>
        <body>
          <h1>Payment Invoice</h1>
          <table>
            <tr>
              <td>Transaction ID:</td>
              <td>${payment.transaction_id}</td>
            </tr>
            <tr>
              <td>Amount:</td>
              <td>$${payment.amount.toFixed(2)} ${payment.currency.toUpperCase()}</td>
            </tr>
            <tr>
              <td>Status:</td>
              <td>${payment.status}</td>
            </tr>
            <tr>
              <td>Date:</td>
              <td>${new Date(payment.created_at).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Description:</td>
              <td>${payment.description}</td>
            </tr>
          </table>
          <p>Thank you for your payment!</p>
        </body>
      </html>
    `;

    // Send invoice via email
    await axios.post(`${process.env.API_URL}/api/notify/email`, {
      email: recipientEmail,
      subject: 'Payment Invoice',
      html: invoiceContent,
    });

    res.json({ success: true, message: 'Invoice sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
