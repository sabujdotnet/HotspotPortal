// backend/services/monetizationService.js
const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Monetization & Affiliate Program Service
 * Manages subscriptions, affiliate tracking, and revenue optimization
 */
class MonetizationService extends EventEmitter {
  constructor(db, config = {}) {
    super();
    this.db = db;
    this.logger = config.logger || console;
    this.stripeClient = config.stripeClient;
  }

  /**
   * ==================== SUBSCRIPTION PLANS ====================
   */

  /**
   * Create subscription plan
   */
  async createPlan(planData) {
    try {
      const {
        name,
        description,
        price,
        currency,
        billingPeriod,
        bandwidthLimit,
        maxDevices,
        features,
        maxUsers,
      } = planData;

      const result = await this.db.query(
        `INSERT INTO subscription_plans (
          name, description, price, currency, billing_period,
          bandwidth_limit, max_devices, features, max_users, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
        RETURNING *`,
        [
          name,
          description,
          price,
          currency || 'USD',
          billingPeriod || 'monthly',
          bandwidthLimit,
          maxDevices,
          JSON.stringify(features || []),
          maxUsers || 100,
        ]
      );

      // Create in Stripe if configured
      if (this.stripeClient) {
        const stripePlan = await this.stripeClient.products.create({
          name,
          description,
          metadata: { databaseId: result.rows[0].id },
        });
      }

      this.logger.info(`Created plan: ${name}`);
      this.emit('plan:created', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error creating plan:', error);
      throw error;
    }
  }

  /**
   * Get all plans
   */
  async getAllPlans() {
    try {
      const result = await this.db.query(
        `SELECT * FROM subscription_plans WHERE status = 'active' ORDER BY price ASC`
      );

      return result.rows.map((plan) => ({
        ...plan,
        features: JSON.parse(plan.features || '[]'),
      }));
    } catch (error) {
      this.logger.error('Error getting plans:', error);
      return [];
    }
  }

  /**
   * Subscribe user to plan
   */
  async subscribeUserToPlan(userId, planId, paymentMethodId) {
    try {
      const plan = await this.db.query(
        'SELECT * FROM subscription_plans WHERE id = $1',
        [planId]
      );

      if (plan.rows.length === 0) {
        throw new Error('Plan not found');
      }

      const planData = plan.rows[0];

      // Create subscription in database
      const result = await this.db.query(
        `INSERT INTO user_subscriptions (
          user_id, plan_id, price, currency, status, next_billing_date, created_at
        ) VALUES ($1, $2, $3, $4, 'active', NOW() + INTERVAL '1 ${planData.billing_period}', NOW())
        RETURNING *`,
        [userId, planId, planData.price, planData.currency]
      );

      const subscription = result.rows[0];

      // Process payment
      const payment = await this.processSubscriptionPayment(
        userId,
        subscription.id,
        planData.price,
        planData.currency,
        paymentMethodId
      );

      this.logger.info(`User ${userId} subscribed to plan ${planId}`);
      this.emit('subscription:created', subscription);

      return { subscription, payment };
    } catch (error) {
      this.logger.error('Error subscribing user:', error);
      throw error;
    }
  }

  /**
   * Process subscription payment
   */
  async processSubscriptionPayment(userId, subscriptionId, amount, currency, paymentMethodId) {
    try {
      if (this.stripeClient) {
        const paymentIntent = await this.stripeClient.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          payment_method: paymentMethodId,
          confirm: true,
          metadata: {
            userId,
            subscriptionId,
            type: 'subscription',
          },
        });

        return paymentIntent;
      }
    } catch (error) {
      this.logger.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId) {
    try {
      const result = await this.db.query(
        `UPDATE user_subscriptions SET status = 'cancelled', cancelled_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [subscriptionId]
      );

      this.logger.info(`Subscription cancelled: ${subscriptionId}`);
      this.emit('subscription:cancelled', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * ==================== AFFILIATE PROGRAM ====================
   */

  /**
   * Register affiliate
   */
  async registerAffiliate(userData) {
    try {
      const {
        email,
        name,
        website,
        commissionRate,
        paymentMethod,
        bankDetails,
      } = userData;

      // Generate affiliate code
      const affiliateCode = this.generateAffiliateCode();

      const result = await this.db.query(
        `INSERT INTO affiliates (
          email, name, website, affiliate_code, commission_rate,
          payment_method, bank_details, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
        RETURNING id, affiliate_code, email, commission_rate`,
        [
          email,
          name,
          website,
          affiliateCode,
          commissionRate || 25,
          paymentMethod || 'bank_transfer',
          JSON.stringify(bankDetails || {}),
        ]
      );

      this.logger.info(`Registered affiliate: ${email} (${affiliateCode})`);
      this.emit('affiliate:registered', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error registering affiliate:', error);
      throw error;
    }
  }

  /**
   * Generate unique affiliate code
   */
  generateAffiliateCode() {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `AFF-${code}`;
  }

  /**
   * Track affiliate click/impression
   */
  async trackAffiliateClick(affiliateCode, referralSource = null) {
    try {
      // Generate tracking token
      const trackingToken = crypto.randomBytes(16).toString('hex');

      const result = await this.db.query(
        `INSERT INTO affiliate_clicks (
          affiliate_code, referral_source, tracking_token, created_at
        ) VALUES ($1, $2, $3, NOW())
        RETURNING tracking_token`,
        [affiliateCode, referralSource, trackingToken]
      );

      return result.rows[0].tracking_token;
    } catch (error) {
      this.logger.error('Error tracking click:', error);
      throw error;
    }
  }

  /**
   * Track affiliate conversion
   */
  async trackAffiliateConversion(trackingToken, userId, amount) {
    try {
      // Get affiliate from tracking token
      const click = await this.db.query(
        'SELECT affiliate_code FROM affiliate_clicks WHERE tracking_token = $1',
        [trackingToken]
      );

      if (click.rows.length === 0) {
        throw new Error('Invalid tracking token');
      }

      const affiliateCode = click.rows[0].affiliate_code;

      // Get affiliate info
      const affiliate = await this.db.query(
        'SELECT id, commission_rate FROM affiliates WHERE affiliate_code = $1',
        [affiliateCode]
      );

      if (affiliate.rows.length === 0) {
        throw new Error('Affiliate not found');
      }

      const affiliateData = affiliate.rows[0];
      const commission = (amount * affiliateData.commission_rate) / 100;

      // Record conversion
      const result = await this.db.query(
        `INSERT INTO affiliate_conversions (
          affiliate_id, user_id, tracking_token, amount, commission, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
        RETURNING *`,
        [
          affiliateData.id,
          userId,
          trackingToken,
          amount,
          commission,
        ]
      );

      this.logger.info(
        `Conversion tracked: ${affiliateCode} - $${amount} (Commission: $${commission})`
      );
      this.emit('affiliate:conversion', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error tracking conversion:', error);
      throw error;
    }
  }

  /**
   * Get affiliate statistics
   */
  async getAffiliateStats(affiliateCode) {
    try {
      // Get affiliate ID
      const affiliate = await this.db.query(
        'SELECT id FROM affiliates WHERE affiliate_code = $1',
        [affiliateCode]
      );

      if (affiliate.rows.length === 0) {
        throw new Error('Affiliate not found');
      }

      const affiliateId = affiliate.rows[0].id;

      // Get clicks
      const clicks = await this.db.query(
        `SELECT COUNT(*) as total_clicks FROM affiliate_clicks WHERE affiliate_code = $1`,
        [affiliateCode]
      );

      // Get conversions
      const conversions = await this.db.query(
        `SELECT 
          COUNT(*) as total_conversions,
          SUM(amount) as total_sales,
          SUM(commission) as total_commission,
          AVG(commission) as avg_commission
         FROM affiliate_conversions
         WHERE affiliate_id = $1`,
        [affiliateId]
      );

      // Get pending commissions
      const pending = await this.db.query(
        `SELECT 
          SUM(commission) as pending_commission,
          COUNT(*) as pending_count
         FROM affiliate_conversions
         WHERE affiliate_id = $1 AND status = 'pending'`,
        [affiliateId]
      );

      // Get paid commissions
      const paid = await this.db.query(
        `SELECT 
          SUM(commission) as paid_commission,
          COUNT(*) as paid_count
         FROM affiliate_conversions
         WHERE affiliate_id = $1 AND status = 'paid'`,
        [affiliateId]
      );

      return {
        affiliateCode,
        clicks: clicks.rows[0].total_clicks || 0,
        conversions: conversions.rows[0].total_conversions || 0,
        totalSales: conversions.rows[0].total_sales || 0,
        totalCommission: conversions.rows[0].total_commission || 0,
        avgCommission: conversions.rows[0].avg_commission || 0,
        pendingCommission: pending.rows[0].pending_commission || 0,
        paidCommission: paid.rows[0].paid_commission || 0,
        conversionRate:
          clicks.rows[0].total_clicks > 0
            ? (
                (conversions.rows[0].total_conversions / clicks.rows[0].total_clicks) *
                100
              ).toFixed(2)
            : 0,
      };
    } catch (error) {
      this.logger.error('Error getting affiliate stats:', error);
      throw error;
    }
  }

  /**
   * ==================== PRICING OPTIMIZATION ====================
   */

  /**
   * Get pricing tiers
   */
  async getPricingTiers() {
    try {
      const result = await this.db.query(
        `SELECT * FROM pricing_tiers ORDER BY min_bandwidth ASC`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting pricing tiers:', error);
      return [];
    }
  }

  /**
   * Calculate dynamic pricing
   */
  async calculateDynamicPrice(bandwidth, demandLevel = 'medium') {
    try {
      const tiers = await this.getPricingTiers();

      // Find applicable tier
      let baseTier = tiers[0];
      for (const tier of tiers) {
        if (bandwidth >= tier.min_bandwidth) {
          baseTier = tier;
        }
      }

      let price = baseTier.price;

      // Apply demand multiplier
      const demandMultipliers = {
        low: 0.8,
        medium: 1.0,
        high: 1.2,
        peak: 1.5,
      };

      price *= demandMultipliers[demandLevel] || 1.0;

      // Apply volume discount if applicable
      if (bandwidth > 100) {
        price *= 0.9; // 10% discount for high bandwidth
      }

      return {
        bandwidth,
        basePrice: baseTier.price,
        demandMultiplier: demandMultipliers[demandLevel],
        finalPrice: price,
        demandLevel,
      };
    } catch (error) {
      this.logger.error('Error calculating price:', error);
      throw error;
    }
  }

  /**
   * ==================== REVENUE TRACKING ====================
   */

  /**
   * Get total revenue
   */
  async getTotalRevenue(daysBack = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          SUM(amount) as total_revenue,
          COUNT(*) as transaction_count,
          AVG(amount) as avg_transaction,
          MAX(amount) as max_transaction,
          MIN(amount) as min_transaction
         FROM payments
         WHERE status = 'completed'
         AND created_at >= NOW() - INTERVAL '${daysBack} days'`
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting revenue:', error);
      return null;
    }
  }

  /**
   * Get revenue by source
   */
  async getRevenueBySource(daysBack = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          source,
          COUNT(*) as transaction_count,
          SUM(amount) as total_revenue,
          AVG(amount) as avg_amount
         FROM payments
         WHERE status = 'completed'
         AND created_at >= NOW() - INTERVAL '${daysBack} days'
         GROUP BY source
         ORDER BY total_revenue DESC`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting revenue by source:', error);
      return [];
    }
  }

  /**
   * Get churn rate
   */
  async getChurnRate(daysBack = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_customers,
          COUNT(CASE WHEN cancelled_at > NOW() - INTERVAL '${daysBack} days' THEN 1 END) as churned,
          (COUNT(CASE WHEN cancelled_at > NOW() - INTERVAL '${daysBack} days' THEN 1 END)::float / 
           COUNT(*)::float * 100) as churn_rate
         FROM user_subscriptions
         WHERE created_at < NOW() - INTERVAL '${daysBack} days'`
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error calculating churn:', error);
      return null;
    }
  }

  /**
   * Get customer lifetime value
   */
  async getCustomerLifetimeValue(userId) {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_purchases,
          SUM(amount) as total_spent,
          AVG(amount) as avg_purchase,
          MAX(created_at) as last_purchase
         FROM payments
         WHERE user_id = $1 AND status = 'completed'`,
        [userId]
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting CLV:', error);
      return null;
    }
  }
}

module.exports = MonetizationService;
