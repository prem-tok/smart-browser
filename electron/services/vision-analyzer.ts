/**
 * Vision Analyzer Service
 * Analyzes screenshots to understand page context and suggest actions
 * Inspired by Comet browser's vision-based automation
 */

import log from 'electron-log';

export interface VisionAnalysisResult {
  pageType: 'email' | 'form' | 'ecommerce' | 'social' | 'search' | 'login' | 'unknown';
  isLoginPage: boolean; // Explicit flag for login page detection
  primaryActions: Array<{
    elementIndex: number;
    action: 'click' | 'type' | 'scroll';
    confidence: number;
    description: string;
  }>;
  formFields: Array<{
    elementIndex: number;
    fieldType: 'email' | 'password' | 'text' | 'textarea' | 'phone' | 'url';
    label: string;
    required: boolean;
    placeholder?: string;
  }>;
  context: {
    pageTitle: string;
    mainContent: string;
    suggestedActions: string[];
    keyElements: string[];
    requiresLogin: boolean; // Flag indicating login is required
  };
  confidence: number; // Overall confidence in analysis (0-1)
}

export interface ElementDescriptor {
  index?: number;
  selector: string;
  innerText: string;
  tagName?: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  type?: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Analyze screenshot and elements to understand page context
 * Uses heuristics and pattern matching (can be enhanced with vision models later)
 */
export async function analyzeScreenshot(
  screenshot: Buffer,
  elements: ElementDescriptor[],
  pageContent?: string,
  currentUrl?: string
): Promise<VisionAnalysisResult> {
  try {
    // Analyze page type based on elements and content
    const pageType = detectPageType(elements, pageContent);
    
    // Identify form fields
    const formFields = identifyFormFields(elements);
    
    // Suggest primary actions based on page type
    const primaryActions = suggestPrimaryActions(elements, pageType);
    
    // Extract context
    const context = extractContext(elements, pageContent);
    
    // Detect login page explicitly (pass URL for accurate detection)
    const isLoginPage = detectLoginPage(elements, pageContent, currentUrl);
    context.requiresLogin = isLoginPage;
    
    // If login page detected, override pageType
    const finalPageType = isLoginPage ? 'login' : pageType;
    
    // Calculate overall confidence
    const confidence = calculateConfidence(elements, finalPageType, formFields);
    
    log.debug(`[VisionAnalyzer] Analyzed page: ${finalPageType}, isLoginPage: ${isLoginPage}, ${formFields.length} form fields, ${primaryActions.length} suggested actions`);
    
    return {
      pageType: finalPageType,
      isLoginPage,
      primaryActions,
      formFields,
      context,
      confidence
    };
  } catch (error) {
    log.error('[VisionAnalyzer] Error analyzing screenshot:', error);
    // Return default analysis on error
    return {
      pageType: 'unknown',
      isLoginPage: false,
      primaryActions: [],
      formFields: [],
      context: {
        pageTitle: '',
        mainContent: pageContent || '',
        suggestedActions: [],
        keyElements: [],
        requiresLogin: false
      },
      confidence: 0
    };
  }
}

/**
 * Detect page type based on elements and content
 */
function detectPageType(
  elements: ElementDescriptor[],
  pageContent?: string
): VisionAnalysisResult['pageType'] {
  const content = (pageContent || '').toLowerCase();
  const elementTexts = elements.map(e => e.innerText.toLowerCase()).join(' ');
  const combined = content + ' ' + elementTexts;
  
  // Email page detection
  if (
    combined.includes('compose') ||
    combined.includes('inbox') ||
    combined.includes('email') ||
    combined.includes('mail') ||
    elements.some(e => 
      e.ariaLabel?.toLowerCase().includes('compose') ||
      e.ariaLabel?.toLowerCase().includes('email') ||
      e.ariaLabel?.toLowerCase().includes('to') ||
      e.ariaLabel?.toLowerCase().includes('subject')
    )
  ) {
    return 'email';
  }
  
  // Form page detection
  if (
    elements.some(e => 
      e.tagName === 'input' ||
      e.tagName === 'textarea' ||
      e.role === 'textbox' ||
      e.type === 'email' ||
      e.type === 'password' ||
      e.type === 'text'
    ) &&
    elements.some(e => 
      e.tagName === 'button' ||
      e.role === 'button' ||
      e.innerText.toLowerCase().includes('submit') ||
      e.innerText.toLowerCase().includes('send') ||
      e.innerText.toLowerCase().includes('login')
    )
  ) {
    return 'form';
  }
  
  // E-commerce detection
  if (
    combined.includes('cart') ||
    combined.includes('checkout') ||
    combined.includes('buy') ||
    combined.includes('add to cart') ||
    combined.includes('price') ||
    elements.some(e => 
      e.innerText.toLowerCase().includes('$') ||
      e.innerText.toLowerCase().includes('cart') ||
      e.innerText.toLowerCase().includes('checkout')
    )
  ) {
    return 'ecommerce';
  }
  
  // Social media detection
  if (
    combined.includes('post') ||
    combined.includes('share') ||
    combined.includes('like') ||
    combined.includes('comment') ||
    combined.includes('follow')
  ) {
    return 'social';
  }
  
  // Search page detection
  if (
    elements.some(e => 
      e.type === 'search' ||
      e.role === 'searchbox' ||
      e.ariaLabel?.toLowerCase().includes('search')
    ) &&
    elements.some(e => 
      e.role === 'button' &&
      (e.innerText.toLowerCase().includes('search') ||
       e.ariaLabel?.toLowerCase().includes('search'))
    )
  ) {
    return 'search';
  }
  
  return 'unknown';
}

/**
 * Explicitly detect login pages
 * This is critical for triggering human_interact
 */
function detectLoginPage(
  elements: ElementDescriptor[],
  pageContent?: string,
  currentUrl?: string
): boolean {
  const url = (currentUrl || '').toLowerCase();
  const content = (pageContent || '').toLowerCase();
  const elementTexts = elements.map(e => e.innerText.toLowerCase()).join(' ');
  const combined = content + ' ' + elementTexts;
  
  // CRITICAL: Check URL FIRST - if URL shows main app, it's NOT a login page
  // Gmail logged in URLs: mail.google.com/mail/u/0/#inbox, mail.google.com/mail/u/0/#compose, etc.
  log.debug(`[VisionAnalyzer] Checking URL for login detection: ${url}`);
  
  if (url.includes('#inbox') || 
      url.includes('#compose') || 
      url.includes('mail.google.com/mail/u/') ||
      (url.includes('mail.google.com') && !url.includes('accounts.google.com'))) {
    log.info(`[VisionAnalyzer] ✅ NOT a login page: URL shows main application (logged in): ${url}`);
    return false;
  }
  
  // Check for login page indicators in URL
  const hasLoginUrl = 
    url.includes('accounts.google.com/signin') ||
    url.includes('accounts.google.com/v3/signin') ||
    url.includes('/login') ||
    url.includes('/signin') ||
    combined.includes('accounts.google.com/signin') ||
    combined.includes('/login') ||
    combined.includes('/signin') ||
    combined.includes('accounts.google.com/v3/signin');
  
  // Check for identifier/email input field
  const hasIdentifierInput = elements.some(e =>
    e.ariaLabel?.toLowerCase().includes('identifier') ||
    e.ariaLabel?.toLowerCase().includes('email') ||
    e.placeholder?.toLowerCase().includes('email') ||
    e.placeholder?.toLowerCase().includes('identifier') ||
    (e.type === 'email' && !e.ariaLabel?.toLowerCase().includes('to')) // Not email compose field
  );
  
  // Check for password field
  const hasPasswordField = elements.some(e =>
    e.type === 'password' ||
    e.ariaLabel?.toLowerCase().includes('password')
  );
  
  // Check for sign in/login button
  const hasSignInButton = elements.some(e =>
    e.innerText.toLowerCase().includes('sign in') ||
    e.innerText.toLowerCase().includes('signin') ||
    e.innerText.toLowerCase().includes('log in') ||
    e.innerText.toLowerCase().includes('login') ||
    e.ariaLabel?.toLowerCase().includes('sign in') ||
    e.ariaLabel?.toLowerCase().includes('signin')
  );
  
  // Check if NO application content is visible (no inbox, no compose, etc.)
  const hasNoAppContent = 
    !combined.includes('inbox') &&
    !combined.includes('compose') &&
    !combined.includes('mail.google.com/mail/u/0/#inbox') &&
    !combined.includes('mail.google.com/mail/u/0/#compose');
  
  // Gmail login page detection (specific case)
  // If we see identifier input but no inbox/compose, it's likely login
  if (hasIdentifierInput && hasNoAppContent) {
    log.info('[VisionAnalyzer] 🔐 Login page detected: identifier input found without application content');
    return true;
  }
  
  // Standard login page: has identifier/email input AND (password field OR sign in button)
  if (hasIdentifierInput && (hasPasswordField || hasSignInButton)) {
    log.info('[VisionAnalyzer] 🔐 Login page detected: identifier input with password/sign in button');
    return true;
  }
  
  // URL-based detection
  if (hasLoginUrl && (hasIdentifierInput || hasPasswordField)) {
    log.info('[VisionAnalyzer] 🔐 Login page detected: login URL with login fields');
    return true;
  }
  
  return false;
}

/**
 * Identify form fields from elements
 */
function identifyFormFields(
  elements: ElementDescriptor[]
): VisionAnalysisResult['formFields'] {
  const formFields: VisionAnalysisResult['formFields'] = [];
  
  for (const element of elements) {
    if (
      element.tagName === 'input' ||
      element.tagName === 'textarea' ||
      element.role === 'textbox' ||
      (element.tagName === 'div' && element.role === 'textbox')
    ) {
      // Determine field type
      let fieldType: VisionAnalysisResult['formFields'][0]['fieldType'] = 'text';
      
      if (element.type === 'email' || 
          element.ariaLabel?.toLowerCase().includes('email') ||
          element.placeholder?.toLowerCase().includes('email') ||
          element.ariaLabel?.toLowerCase().includes('to')) {
        fieldType = 'email';
      } else if (element.type === 'password' ||
                 element.ariaLabel?.toLowerCase().includes('password')) {
        fieldType = 'password';
      } else if (element.type === 'tel' ||
                 element.ariaLabel?.toLowerCase().includes('phone')) {
        fieldType = 'phone';
      } else if (element.type === 'url' ||
                 element.ariaLabel?.toLowerCase().includes('url')) {
        fieldType = 'url';
      } else if (element.tagName === 'textarea' ||
                 (element.tagName === 'div' && element.role === 'textbox')) {
        fieldType = 'textarea';
      }
      
      // Determine if required
      const isRequired = 
        element.ariaLabel?.toLowerCase().includes('required') ||
        element.innerText.toLowerCase().includes('required') ||
        false; // Can be enhanced with actual required attribute check
      
      // Get label
      const label = 
        element.ariaLabel ||
        element.placeholder ||
        element.innerText.substring(0, 50) ||
        `${fieldType} field`;
      
      if (element.index !== undefined) {
        formFields.push({
          elementIndex: element.index,
          fieldType,
          label,
          required: isRequired,
          placeholder: element.placeholder
        });
      }
    }
  }
  
  return formFields;
}

/**
 * Suggest primary actions based on page type and elements
 */
function suggestPrimaryActions(
  elements: ElementDescriptor[],
  pageType: VisionAnalysisResult['pageType']
): VisionAnalysisResult['primaryActions'] {
  const actions: VisionAnalysisResult['primaryActions'] = [];
  
  // Email page actions
  if (pageType === 'email') {
    const composeButton = elements.find(e => 
      e.innerText.toLowerCase().includes('compose') ||
      e.ariaLabel?.toLowerCase().includes('compose')
    );
    if (composeButton && composeButton.index !== undefined) {
      actions.push({
        elementIndex: composeButton.index,
        action: 'click',
        confidence: 0.9,
        description: 'Click Compose button to start new email'
      });
    }
  }
  
  // Form page actions
  if (pageType === 'form') {
    const submitButton = elements.find(e => 
      e.tagName === 'button' &&
      (e.innerText.toLowerCase().includes('submit') ||
       e.innerText.toLowerCase().includes('send') ||
       e.innerText.toLowerCase().includes('login') ||
       e.innerText.toLowerCase().includes('sign in') ||
       e.type === 'submit')
    );
    if (submitButton && submitButton.index !== undefined) {
      actions.push({
        elementIndex: submitButton.index,
        action: 'click',
        confidence: 0.85,
        description: 'Submit form'
      });
    }
  }
  
  // Search page actions
  if (pageType === 'search') {
    const searchInput = elements.find(e => 
      e.type === 'search' ||
      e.role === 'searchbox' ||
      e.ariaLabel?.toLowerCase().includes('search')
    );
    if (searchInput && searchInput.index !== undefined) {
      actions.push({
        elementIndex: searchInput.index,
        action: 'type',
        confidence: 0.9,
        description: 'Enter search query'
      });
    }
  }
  
  return actions;
}

/**
 * Extract context from page
 */
function extractContext(
  elements: ElementDescriptor[],
  pageContent?: string
): VisionAnalysisResult['context'] {
  // Extract page title (from elements with heading tags or prominent text)
  const headings = elements.filter(e => 
    e.tagName === 'h1' ||
    e.tagName === 'h2' ||
    e.role === 'heading'
  );
  const pageTitle = headings[0]?.innerText || '';
  
  // Extract main content (first few paragraphs or divs with substantial text)
  const contentElements = elements.filter(e => 
    e.innerText.length > 50 &&
    !e.tagName?.match(/^(button|input|a)$/i)
  );
  const mainContent = contentElements
    .slice(0, 3)
    .map(e => e.innerText)
    .join(' ')
    .substring(0, 500);
  
  // Identify key elements
  const keyElements = elements
    .filter(e => 
      e.tagName === 'button' ||
      e.role === 'button' ||
      e.tagName === 'input' ||
      e.role === 'textbox'
    )
    .slice(0, 10)
    .map(e => e.ariaLabel || e.innerText || e.selector)
    .filter(text => text.length > 0);
  
  // Suggest actions based on available elements
  const suggestedActions: string[] = [];
  if (elements.some(e => e.tagName === 'button' || e.role === 'button')) {
    suggestedActions.push('Click buttons to navigate or submit');
  }
  if (elements.some(e => e.tagName === 'input' || e.role === 'textbox')) {
    suggestedActions.push('Fill in form fields');
  }
  if (elements.some(e => e.tagName === 'a')) {
    suggestedActions.push('Click links to navigate');
  }
  
  return {
    pageTitle,
    mainContent,
    suggestedActions,
    keyElements
  };
}

/**
 * Calculate confidence in analysis
 */
function calculateConfidence(
  elements: ElementDescriptor[],
  pageType: VisionAnalysisResult['pageType'],
  formFields: VisionAnalysisResult['formFields']
): number {
  let confidence = 0.5; // Base confidence
  
  // Increase confidence if we have many elements
  if (elements.length > 10) confidence += 0.1;
  if (elements.length > 50) confidence += 0.1;
  
  // Increase confidence if page type is detected
  if (pageType !== 'unknown') confidence += 0.2;
  
  // Increase confidence if form fields are identified
  if (formFields.length > 0) confidence += 0.1;
  
  // Cap at 1.0
  return Math.min(confidence, 1.0);
}

