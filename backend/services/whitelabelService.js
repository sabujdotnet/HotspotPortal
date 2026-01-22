// backend/services/whitelabelService.js
const EventEmitter = require('events');

/**
 * White-Label Service
 * Manages reseller accounts, branding, and custom configurations
 */
class WhiteLabelService extends EventEmitter {
  constructor(db, config = {}) {
    super();
    this.db = db;
    this.logger = config.logger || console;
  }

  /**
   * ==================== RESELLER MANAGEMENT ====================
   */

  /**
   * Create reseller account
   */
  async createReseller(data) {
    try {
      const {
        businessName,
        email,
        phone,
        country,
        address,
        contactPerson,
        commissionRate,
        maxUsers,
      } = data;

      const result = await this.db.query(
        `INSERT INTO resellers (
          business_name, email, phone, country, address, contact_person,
          commission_rate, max_users, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
        RETURNING id, business_name, email, api_key`,
        [
          businessName,
          email,
          phone,
          country,
          address,
          contactPerson,
          commissionRate || 20,
          maxUsers || 1000,
        ]
      );

      const reseller = result.rows[0];

      // Generate API key
      const apiKey = await this.generateAPIKey(reseller.id);

      this.logger.info(`Created reseller: ${businessName}`);
      this.emit('reseller:created', reseller);

      return {
        ...reseller,
        apiKey,
      };
    } catch (error) {
      this.logger.error('Error creating reseller:', error);
      throw error;
    }
  }

  /**
   * Generate API key for reseller
   */
  async generateAPIKey(resellerId) {
    try {
      const crypto = require('crypto');
      const apiKey = crypto.randomBytes(32).toString('hex');

      await this.db.query(
        'UPDATE resellers SET api_key = $1 WHERE id = $2',
        [apiKey, resellerId]
      );

      return apiKey;
    } catch (error) {
      this.logger.error('Error generating API key:', error);
      throw error;
    }
  }

  /**
   * Get reseller details
   */
  async getReseller(resellerId) {
    try {
      const result = await this.db.query(
        `SELECT 
          id, business_name, email, phone, country, address,
          contact_person, commission_rate, max_users, status,
          created_at, api_key
         FROM resellers WHERE id = $1`,
        [resellerId]
      );

      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting reseller:', error);
      return null;
    }
  }

  /**
   * Update reseller details
   */
  async updateReseller(resellerId, updates) {
    try {
      const fields = Object.keys(updates);
      const values = Object.values(updates);

      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

      const result = await this.db.query(
        `UPDATE resellers SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, resellerId]
      );

      this.logger.info(`Updated reseller: ${resellerId}`);
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error updating reseller:', error);
      throw error;
    }
  }

  /**
   * Get all resellers
   */
  async getAllResellers(limit = 50, offset = 0) {
    try {
      const result = await this.db.query(
        `SELECT 
          id, business_name, email, phone, commission_rate, max_users,
          status, created_at
         FROM resellers
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting resellers:', error);
      return [];
    }
  }

  /**
   * ==================== CUSTOM BRANDING ====================
   */

  /**
   * Create branding profile for reseller
   */
  async createBrandingProfile(resellerId, brandingData) {
    try {
      const {
        companyName,
        companyLogo,
        companyLogoUrl,
        primaryColor,
        secondaryColor,
        fontFamily,
        customCSS,
        supportEmail,
        supportPhone,
        supportURL,
      } = brandingData;

      const result = await this.db.query(
        `INSERT INTO reseller_branding (
          reseller_id, company_name, company_logo, company_logo_url,
          primary_color, secondary_color, font_family, custom_css,
          support_email, support_phone, support_url, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING *`,
        [
          resellerId,
          companyName,
          companyLogo,
          companyLogoUrl,
          primaryColor || '#2563eb',
          secondaryColor || '#1e40af',
          fontFamily || 'sans-serif',
          customCSS,
          supportEmail,
          supportPhone,
          supportURL,
        ]
      );

      this.logger.info(`Created branding for reseller: ${resellerId}`);
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error creating branding:', error);
      throw error;
    }
  }

  /**
   * Get branding profile
   */
  async getBrandingProfile(resellerId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM reseller_branding WHERE reseller_id = $1`,
        [resellerId]
      );

      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting branding:', error);
      return null;
    }
  }

  /**
   * Update branding profile
   */
  async updateBrandingProfile(resellerId, updates) {
    try {
      const fields = Object.keys(updates);
      const values = Object.values(updates);

      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

      const result = await this.db.query(
        `UPDATE reseller_branding SET ${setClause}, updated_at = NOW()
         WHERE reseller_id = $${fields.length + 1} RETURNING *`,
        [...values, resellerId]
      );

      this.logger.info(`Updated branding for reseller: ${resellerId}`);
      this.emit('branding:updated', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error updating branding:', error);
      throw error;
    }
  }

  /**
   * Get CSS for reseller branding
   */
  async getResallerCSS(resellerId) {
    try {
      const branding = await this.getBrandingProfile(resellerId);

      if (!branding) return '';

      let css = `
        :root {
          --primary-color: ${branding.primary_color};
          --secondary-color: ${branding.secondary_color};
          --font-family: ${branding.font_family};
        }

        body {
          font-family: var(--font-family);
        }

        .btn-primary {
          background-color: var(--primary-color);
        }

        .btn-secondary {
          background-color: var(--secondary-color);
        }

        .logo {
          background-image: url('${branding.company_logo_url}');
        }
      `;

      if (branding.custom_css) {
        css += branding.custom_css;
      }

      return css;
    } catch (error) {
      this.logger.error('Error getting reseller CSS:', error);
      return '';
    }
  }

  /**
   * ==================== COMMISSION & EARNINGS ====================
   */

  /**
   * Get reseller commission structure
   */
  async getCommissionStructure(resellerId) {
    try {
      const result = await this.db.query(
        `SELECT 
          id, reseller_id, transaction_type, rate, min_amount, max_amount,
          created_at
         FROM commission_rates
         WHERE reseller_id = $1
         ORDER BY min_amount ASC`,
        [resellerId]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting commission structure:', error);
      return [];
    }
  }

  /**
   * Calculate commission for transaction
   */
  async calculateCommission(resellerId, amount, transactionType = 'voucher_sale') {
    try {
      const commissions = await this.getCommissionStructure(resellerId);

      // Find applicable commission rate
      let applicableRate = 0;
      for (const commission of commissions) {
        if (
          amount >= commission.min_amount &&
          (!commission.max_amount || amount <= commission.max_amount)
        ) {
          applicableRate = commission.rate;
          break;
        }
      }

      // If no specific rate found, use default
      if (applicableRate === 0) {
        const reseller = await this.getReseller(resellerId);
        applicableRate = reseller?.commission_rate || 20;
      }

      const commissionAmount = (amount * applicableRate) / 100;

      return {
        amount,
        rate: applicableRate,
        commission: commissionAmount,
        nettAmount: amount - commissionAmount,
      };
    } catch (error) {
      this.logger.error('Error calculating commission:', error);
      throw error;
    }
  }

  /**
   * Get reseller earnings
   */
  async getResellerEarnings(resellerId, daysBack = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as transaction_count,
          SUM(amount) as total_sales,
          SUM(commission_amount) as total_commission,
          AVG(commission_amount) as avg_commission
         FROM reseller_commissions
         WHERE reseller_id = $1
         AND created_at >= NOW() - INTERVAL '${daysBack} days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [resellerId]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting reseller earnings:', error);
      return [];
    }
  }

  /**
   * Get reseller total earnings
   */
  async getResellerTotalEarnings(resellerId) {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_transactions,
          SUM(amount) as total_sales,
          SUM(commission_amount) as total_commission,
          SUM(paid_amount) as total_paid,
          SUM(commission_amount) - SUM(paid_amount) as pending_payout
         FROM reseller_commissions
         WHERE reseller_id = $1`,
        [resellerId]
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting total earnings:', error);
      return null;
    }
  }

  /**
   * ==================== RESELLER USERS ====================
   */

  /**
   * Get reseller's customer count
   */
  async getResellerCustomerCount(resellerId) {
    try {
      const result = await this.db.query(
        `SELECT COUNT(*) as count FROM hotspot_users WHERE reseller_id = $1`,
        [resellerId]
      );

      return result.rows[0].count;
    } catch (error) {
      this.logger.error('Error getting customer count:', error);
      return 0;
    }
  }

  /**
   * Get reseller's customers
   */
  async getResellerCustomers(resellerId, limit = 50, offset = 0) {
    try {
      const result = await this.db.query(
        `SELECT 
          id, username, email, phone, status, bandwidth_limit,
          created_at, expiry_date
         FROM hotspot_users
         WHERE reseller_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [resellerId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting reseller customers:', error);
      return [];
    }
  }

  /**
   * Get reseller's vouchers
   */
  async getResellerVouchers(resellerId, limit = 50, offset = 0) {
    try {
      const result = await this.db.query(
        `SELECT 
          id, code, days, bandwidth, price, status, created_at, redeemed_at
         FROM vouchers
         WHERE reseller_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [resellerId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting reseller vouchers:', error);
      return [];
    }
  }

  /**
   * ==================== RESELLER DASHBOARD ANALYTICS ====================
   */

  /**
   * Get reseller dashboard summary
   */
  async getResellerDashboard(resellerId) {
    try {
      const customerCount = await this.getResellerCustomerCount(resellerId);
      const earnings = await this.getResellerTotalEarnings(resellerId);

      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_vouchers,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_vouchers,
          COUNT(CASE WHEN status = 'redeemed' THEN 1 END) as redeemed_vouchers,
          SUM(CASE WHEN status = 'redeemed' THEN price ELSE 0 END) as revenue
         FROM vouchers
         WHERE reseller_id = $1`,
        [resellerId]
      );

      const voucherStats = result.rows[0];

      return {
        customerCount,
        earnings: {
          ...earnings,
          totalCommission: earnings?.total_commission || 0,
          pendingPayout: earnings?.pending_payout || 0,
        },
        voucherStats,
      };
    } catch (error) {
      this.logger.error('Error getting reseller dashboard:', error);
      return null;
    }
  }

  /**
   * ==================== PAYOUT MANAGEMENT ====================
   */

  /**
   * Create payout request
   */
  async createPayoutRequest(resellerId, amount, bankDetails) {
    try {
      const result = await this.db.query(
        `INSERT INTO reseller_payouts (
          reseller_id, amount, bank_details, status, created_at
        ) VALUES ($1, $2, $3, 'pending', NOW())
        RETURNING id, reseller_id, amount, status, created_at`,
        [resellerId, amount, JSON.stringify(bankDetails)]
      );

      this.logger.info(`Payout request created: ${resellerId} - $${amount}`);
      this.emit('payout:requested', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error creating payout:', error);
      throw error;
    }
  }

  /**
   * Approve payout
   */
  async approvePayout(payoutId) {
    try {
      const result = await this.db.query(
        `UPDATE reseller_payouts 
         SET status = 'approved', approved_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [payoutId]
      );

      this.logger.info(`Payout approved: ${payoutId}`);
      this.emit('payout:approved', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error approving payout:', error);
      throw error;
    }
  }

  /**
   * Complete payout
   */
  async completePayout(payoutId, transactionId) {
    try {
      const result = await this.db.query(
        `UPDATE reseller_payouts 
         SET status = 'completed', transaction_id = $2, completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [payoutId, transactionId]
      );

      this.logger.info(`Payout completed: ${payoutId}`);
      this.emit('payout:completed', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error completing payout:', error);
      throw error;
    }
  }

  /**
   * Get pending payouts
   */
  async getPendingPayouts() {
    try {
      const result = await this.db.query(
        `SELECT 
          p.id, p.reseller_id, p.amount, p.status, p.created_at,
          r.business_name, r.email
         FROM reseller_payouts p
         JOIN resellers r ON p.reseller_id = r.id
         WHERE p.status IN ('pending', 'approved')
         ORDER BY p.created_at ASC`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting pending payouts:', error);
      return [];
    }
  }
}

module.exports = WhiteLabelService;
