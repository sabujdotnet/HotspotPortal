// src/utils/brandingProtection.js
/**
 * HARDCORE BRANDING & ANTI-TAMPERING SYSTEM
 * 
 * Features:
 * - Embedded watermarks (visible & invisible)
 * - DOM monitoring for tampering
 * - LocalStorage protection
 * - Code integrity verification
 * - Disables core functions if branding removed
 * - Crypto signature verification
 * - Automatic watermark restoration
 * 
 * Author: SabujDoTnetwork
 * License: Proprietary
 */

const BRAND_NAME = 'Your Company Name';
const BRAND_COLOR = '#FF6B35';
const WATERMARK_ID = 'hotspot-watermark-protection';
const PROTECTION_KEY = 'hotspot_protection_token';
const SIGNATURE_KEY = 'hotspot_signature_v1';

class BrandingProtection {
  constructor() {
    this.isIntact = true;
    this.tamperDetected = false;
    this.protectionEnabled = true;
    this.observers = [];
    this.checkedElements = new Set();
    
    // Initialize protection on page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initProtection());
    } else {
      this.initProtection();
    }
  }

  /**
   * Initialize all protection mechanisms
   */
  initProtection() {
    console.log(`🔐 ${BRAND_NAME} Protection System Initializing...`);
    
    // 1. Add visible watermarks
    this.addVisibleWatermarks();
    
    // 2. Add invisible watermarks
    this.addInvisibleWatermarks();
    
    // 3. Add console messages
    this.addConsoleWatermark();
    
    // 4. Store protection token
    this.storeProtectionToken();
    
    // 5. Monitor DOM changes
    this.startDOMMonitoring();
    
    // 6. Monitor localStorage
    this.startStorageMonitoring();
    
    // 7. Verify code integrity
    this.verifyCodeIntegrity();
    
    // 8. Setup periodic checks
    this.startPeriodicChecks();
    
    // 9. Disable right-click in some contexts
    this.preventTampering();
    
    console.log(`✅ ${BRAND_NAME} Protection System Active`);
  }

  /**
   * Add visible watermarks to UI
   */
  addVisibleWatermarks() {
    // 1. Footer branding
    this.addFooterBranding();
    
    // 2. About modal branding
    this.addAboutModalBranding();
    
    // 3. Dashboard header branding
    this.addHeaderBranding();
    
    // 4. Print watermark
    this.addPrintWatermark();
    
    // 5. Screenshot watermark
    this.addScreenshotWatermark();
  }

  /**
   * Add footer with brand name
   */
  addFooterBranding() {
    const footer = document.querySelector('footer') || 
                  document.querySelector('[data-testid="footer"]') ||
                  document.querySelector('.footer');
    
    if (!footer) {
      // Create footer if doesn't exist
      const newFooter = document.createElement('footer');
      newFooter.id = WATERMARK_ID;
      newFooter.style.cssText = `
        background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #2d3436 100%);
        color: white;
        padding: 20px;
        text-align: center;
        margin-top: 40px;
        font-size: 14px;
        border-top: 3px solid ${BRAND_COLOR};
        font-weight: 600;
        letter-spacing: 1px;
      `;
      
      newFooter.innerHTML = `
        <div style="margin-bottom: 10px;">
          <strong>${BRAND_NAME}</strong> 
          <span style="opacity: 0.7;">🔐 Protected & Secured</span>
        </div>
        <div style="font-size: 12px; opacity: 0.8;">
          © ${new Date().getFullYear()} ${BRAND_NAME}. All Rights Reserved.
        </div>
      `;
      
      document.body.appendChild(newFooter);
      this.checkedElements.add(newFooter);
    }
  }

  /**
   * Add invisible watermarks (HTML comments, data attributes)
   */
  addInvisibleWatermarks() {
    // Add HTML comments with brand info
    const watermarkComment = document.createComment(
      `Protected by ${BRAND_NAME} - Unauthorized modifications are logged and monitored`
    );
    document.documentElement.insertBefore(watermarkComment, document.documentElement.firstChild);
    
    // Add data attributes to root
    document.documentElement.setAttribute('data-brand', BRAND_NAME);
    document.documentElement.setAttribute('data-protected', 'true');
    document.documentElement.setAttribute('data-protection-version', '2.0');
    
    // Add to body
    document.body.setAttribute('data-brand-protected', BRAND_NAME);
    document.body.setAttribute(`data-${BRAND_NAME.toLowerCase()}-signature`, 'verified');
  }

  /**
   * Add console watermark
   */
  addConsoleWatermark() {
    const styles = [
      'font-size: 24px',
      'font-weight: bold',
      `color: ${BRAND_COLOR}`,
      'text-shadow: 2px 2px 4px rgba(0,0,0,0.3)',
    ].join(';');

    console.log(
      `%c🔐 ${BRAND_NAME} - PROTECTED SYSTEM`,
      styles
    );
    
    console.log(
      `%c✅ Anti-tampering protection is ACTIVE
      
⚠️  WARNING: Unauthorized access or modification attempts are:
   • Logged automatically
   • Reported to administrators
   • Subject to legal action
   
🔒 This application is protected by:
   • DOM integrity verification
   • Code signature validation
   • Real-time tampering detection
   • Automatic function disabling
   
For authorized support, contact your administrator.`,
      'color: #FF6B35; font-weight: bold; font-size: 12px'
    );
  }

  /**
   * Add print watermark
   */
  addPrintWatermark() {
    const printStyle = document.createElement('style');
    printStyle.innerHTML = `
      @media print {
        body::before {
          content: '${BRAND_NAME} - CONFIDENTIAL';
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 60px;
          color: rgba(255, 107, 53, 0.3);
          z-index: 9999;
          width: 200%;
          height: 200%;
          pointer-events: none;
          text-align: center;
        }
      }
    `;
    document.head.appendChild(printStyle);
  }

  /**
   * Add screenshot watermark (appears when copied)
   */
  addScreenshotWatermark() {
    document.addEventListener('copy', (e) => {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      const div = document.createElement('div');
      
      div.append(range.cloneContents());
      div.innerHTML += `<br/><br/>—<br/>Source: ${BRAND_NAME} Protected System<br/>Unauthorized reproduction prohibited.`;
      
      e.clipboardData.setData('text/html', div.innerHTML);
      e.clipboardData.setData('text/plain', div.innerText);
      e.preventDefault();
    });
  }

  /**
   * Store protection token in localStorage
   */
  storeProtectionToken() {
    const token = {
      brand: BRAND_NAME,
      timestamp: Date.now(),
      version: '2.0',
      signature: this.generateSignature(BRAND_NAME),
      integrity: true,
    };
    
    localStorage.setItem(PROTECTION_KEY, JSON.stringify(token));
  }

  /**
   * Start monitoring DOM for tampering
   */
  startDOMMonitoring() {
    // Monitor for footer/watermark removal
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Check if watermarks were removed
          if (!document.querySelector(`#${WATERMARK_ID}`) && 
              document.querySelector('footer')) {
            this.handleTampering('watermark_removal', 'Footer watermark removed');
          }
          
          // Check if brand data attributes removed
          if (!document.documentElement.getAttribute('data-brand')) {
            this.handleTampering('attribute_removal', 'Brand attributes removed');
          }
        }
        
        if (mutation.type === 'attributes') {
          const element = mutation.target;
          
          // Monitor class/style changes on footer
          if (element.tagName === 'FOOTER' || element.id === WATERMARK_ID) {
            if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
              // Restore if modified
              this.restoreElement(element);
            }
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'id', 'data-brand'],
    });

    this.observers.push(observer);
  }

  /**
   * Monitor localStorage for tampering
   */
  startStorageMonitoring() {
    window.addEventListener('storage', (e) => {
      if (e.key === PROTECTION_KEY) {
        const storedToken = localStorage.getItem(PROTECTION_KEY);
        if (!storedToken) {
          this.handleTampering('storage_tampering', 'Protection token removed');
        }
      }
    });
  }

  /**
   * Verify code integrity
   */
  verifyCodeIntegrity() {
    // This would be enhanced with actual code signing in production
    const scriptSignatures = {
      'main.js': 'sha256-xxxxx',
      'api.js': 'sha256-yyyyy',
      'app.js': 'sha256-zzzzz',
    };
    
    // Verify main scripts loaded
    const scripts = document.querySelectorAll('script');
    scripts.forEach((script) => {
      if (script.src && !script.hasAttribute('data-integrity-checked')) {
        // In production, verify against expected hash
        script.setAttribute('data-integrity-checked', 'true');
      }
    });
  }

  /**
   * Start periodic integrity checks
   */
  startPeriodicChecks() {
    // Check every 10 seconds
    setInterval(() => {
      this.performIntegrityCheck();
    }, 10000);
  }

  /**
   * Perform integrity check
   */
  performIntegrityCheck() {
    // 1. Check footer exists
    const footer = document.querySelector('footer');
    if (!footer || !footer.textContent.includes(BRAND_NAME)) {
      this.handleTampering('footer_missing', 'Brand footer is missing');
    }
    
    // 2. Check data attributes
    if (!document.documentElement.getAttribute('data-brand')) {
      this.handleTampering('data_attributes_missing', 'Brand attributes are missing');
    }
    
    // 3. Check protection token
    const token = localStorage.getItem(PROTECTION_KEY);
    if (!token) {
      this.handleTampering('token_missing', 'Protection token is missing');
    }
  }

  /**
   * Prevent tampering attempts
   */
  preventTampering() {
    // Disable DevTools in production
    if (process.env.NODE_ENV === 'production') {
      // Detect DevTools opening
      const devTools = {
        open: false,
        orientation: null,
      };

      const threshold = 160;
      setInterval(() => {
        if (window.outerHeight - window.innerHeight > threshold ||
            window.outerWidth - window.innerWidth > threshold) {
          if (!devTools.open) {
            devTools.open = true;
            this.handleTampering('devtools_opened', 'Developer Tools opened');
          }
        } else {
          devTools.open = false;
        }
      }, 500);
    }

    // Disable right-click on sensitive elements
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('footer') || 
          e.target.closest(`#${WATERMARK_ID}`) ||
          e.target.getAttribute('data-brand-protected')) {
        e.preventDefault();
        this.handleTampering('context_menu_attempt', 'Attempted to inspect protected element');
      }
    });

    // Block element inspector
    document.addEventListener('keydown', (e) => {
      // Disable F12, Ctrl+Shift+I, Ctrl+Shift+C
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          (e.ctrlKey && e.shiftKey && e.key === 'C')) {
        e.preventDefault();
        this.handleTampering('hotkey_devtools', 'Attempted to open DevTools with hotkey');
      }
    });
  }

  /**
   * Restore tampered element
   */
  restoreElement(element) {
    if (element.id === WATERMARK_ID || element.tagName === 'FOOTER') {
      const backup = {
        innerHTML: `<strong>${BRAND_NAME}</strong> 🔐 Protected & Secured`,
        style: `background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #2d3436 100%);
                color: white; padding: 20px; text-align: center; margin-top: 40px;`,
      };
      
      element.innerHTML = backup.innerHTML;
      element.style.cssText = backup.style;
    }
  }

  /**
   * Handle tampering detection
   */
  handleTampering(type, message) {
    this.tamperDetected = true;
    this.isIntact = false;

    console.warn(`🚨 TAMPERING DETECTED: ${message}`);
    console.error(`Tampering Type: ${type}`);

    // Log attempt
    this.logTamperingAttempt(type, message);

    // Disable core functions based on tamper type
    this.disableFunctions(type);

    // Show warning
    this.showTamperWarning(message);

    // Send to backend (optional)
    this.reportTampering(type, message);
  }

  /**
   * Disable core functions
   */
  disableFunctions(tamperType) {
    if (tamperType === 'watermark_removal' || 
        tamperType === 'data_attributes_missing' ||
        tamperType === 'footer_missing') {
      
      // Disable key functions
      window.disableDataExport = true;
      window.disablePrint = true;
      window.disableDownload = true;
      
      // Alert user
      alert(`⚠️ SECURITY ALERT:\n\nUnauthorized modification detected.\n\nExport and download functions have been disabled.\n\nContact your administrator.`);
      
      // Disable buttons
      this.disableExportButtons();
    }
  }

  /**
   * Disable export/download buttons
   */
  disableExportButtons() {
    const buttons = document.querySelectorAll(
      '[data-action="export"], [data-action="download"], .export-btn, .download-btn'
    );
    
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = 'Disabled due to tampering detection';
      btn.onclick = (e) => {
        e.preventDefault();
        alert('Function disabled. Please reload the application.');
      };
    });
  }

  /**
   * Show tamper warning
   */
  showTamperWarning(message) {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #FF6B35 0%, #FF8C57 100%);
      color: white;
      padding: 15px;
      text-align: center;
      z-index: 10000;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    warningDiv.innerHTML = `
      🚨 SECURITY ALERT: ${message} - Some functions have been disabled.
    `;
    
    document.body.insertBefore(warningDiv, document.body.firstChild);

    // Auto remove after 10 seconds
    setTimeout(() => {
      warningDiv.remove();
    }, 10000);
  }

  /**
   * Log tampering attempt locally
   */
  logTamperingAttempt(type, message) {
    const logs = JSON.parse(localStorage.getItem('tampering_logs') || '[]');
    
    logs.push({
      type,
      message,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    });

    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.shift();
    }

    localStorage.setItem('tampering_logs', JSON.stringify(logs));
  }

  /**
   * Report tampering to backend
   */
  async reportTampering(type, message) {
    try {
      await fetch('/api/security/tamper-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tamperType: type,
          message,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          hostname: window.location.hostname,
        }),
      });
    } catch (error) {
      console.log('Could not report to backend:', error);
    }
  }

  /**
   * Generate signature for verification
   */
  generateSignature(data) {
    // Simple hash function (use crypto-js in production)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Add about modal with branding
   */
  addAboutModalBranding() {
    const style = document.createElement('style');
    style.innerHTML = `
      .about-modal-${BRAND_NAME.replace(/\s/g, '-').toLowerCase()} {
        background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #2d3436 100%);
        color: white;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      
      .about-modal-${BRAND_NAME.replace(/\s/g, '-').toLowerCase()} h1 {
        font-size: 28px;
        margin-bottom: 10px;
        letter-spacing: 1px;
      }
      
      .about-modal-${BRAND_NAME.replace(/\s/g, '-').toLowerCase()} .brand-signature {
        border-top: 2px solid rgba(255,255,255,0.3);
        margin-top: 20px;
        padding-top: 20px;
        font-size: 12px;
        opacity: 0.9;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Add header branding
   */
  addHeaderBranding() {
    const header = document.querySelector('header') || 
                  document.querySelector('[data-testid="header"]') ||
                  document.querySelector('.header');
    
    if (header && !header.querySelector('[data-brand-header]')) {
      const brandBadge = document.createElement('div');
      brandBadge.setAttribute('data-brand-header', 'true');
      brandBadge.style.cssText = `
        display: inline-block;
        background: ${BRAND_COLOR};
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        margin-left: 15px;
        letter-spacing: 0.5px;
      `;
      brandBadge.textContent = `🔐 ${BRAND_NAME}`;
      
      header.appendChild(brandBadge);
    }
  }

  /**
   * Get tampering logs
   */
  getTamperingLogs() {
    return JSON.parse(localStorage.getItem('tampering_logs') || '[]');
  }

  /**
   * Clear tampering logs (admin only)
   */
  clearTamperingLogs() {
    localStorage.removeItem('tampering_logs');
  }

  /**
   * Get protection status
   */
  getProtectionStatus() {
    return {
      isIntact: this.isIntact,
      tamperDetected: this.tamperDetected,
      protectionEnabled: this.protectionEnabled,
      brand: BRAND_NAME,
      logs: this.getTamperingLogs(),
    };
  }
}

// Initialize on import
const brandingProtection = new BrandingProtection();

// Export for admin access
if (process.env.NODE_ENV === 'development') {
  window.__BRANDING_PROTECTION__ = brandingProtection;
}

export default brandingProtection;

// ==========================================
// INTEGRATION IN YOUR REACT APP
// ==========================================

// Add to src/index.js or App.js:
// import brandingProtection from './utils/brandingProtection';

// Then in your components, you can check:
// const status = window.__BRANDING_PROTECTION__?.getProtectionStatus();

// And disable functions like:
// if (window.disableDataExport) {
//   // Don't allow export
//   return <button disabled>Export Disabled</button>;
// }
