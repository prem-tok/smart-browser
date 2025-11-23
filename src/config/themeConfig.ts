// theme/themeConfig.ts - ChatGPT Atlas inspired clean theme
import type { ThemeConfig } from 'antd';
import { theme as antdDarkTheme } from 'antd';

// Create Ant Design theme configuration with ChatGPT Atlas style
const theme: ThemeConfig = {
  algorithm: antdDarkTheme.darkAlgorithm, // Use dark algorithm
  token: {
    // Base colors - ChatGPT Atlas green accent theme
    colorPrimary: '#10a37f',      // ChatGPT green primary color
    colorPrimaryHover: '#1a7f64',  // Darker green on hover
    colorSuccess: '#10B981',       // Green success color
    colorWarning: '#F59E0B',       // Amber warning color
    colorError: '#EF4444',         // Red error color
    colorInfo: '#10a37f',          // Green info color

    // Text colors - high contrast white (Fellou.ai style)
    colorText: '#ffffff',                             // Primary text - pure white
    colorTextSecondary: '#d9d9d9',                    // Secondary text - light gray
    colorTextTertiary: 'rgba(255, 255, 255, 0.5)',    // Tertiary text
    colorTextQuaternary: 'rgba(255, 255, 255, 0.6)',  // Message text

    // Background colors - glass morphism (Fellou.ai #ffffff0f style)
    colorBgContainer: 'rgba(255, 255, 255, 0.06)',     // Container background (~10% opacity)
    colorBgElevated: 'rgba(255, 255, 255, 0.06)',      // Elevated background
    colorBgLayout: 'rgba(255, 255, 255, 0.04)',        // Layout background
    colorBgSpotlight: 'rgba(255, 255, 255, 0.08)',     // Spotlight background

    // Border colors - subtle borders (Fellou.ai rgba(255,255,255,.17))
    colorBorder: 'rgba(255, 255, 255, 0.17)', // Border color - 17% opacity
    colorBorderSecondary: 'rgba(255, 255, 255, 0.1)', // Secondary border

    // Others - Fellou.ai inspired
    borderRadius: 12,              // Base border radius
    borderRadiusLG: 20,            // Large components (cards, modals)
    borderRadiusXS: 8,             // Small components (buttons)
    fontSize: 14,
    fontSizeHeading1: 48,          // Large headings
    fontSizeHeading2: 32,          // Medium headings
    fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',

    // Shadows - deeper shadows for glass effect
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    boxShadowSecondary: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },
  components: {
    // Drawer component - ChatGPT Atlas clean style
    Drawer: {
      colorBgElevated: '#1e1e1e',                          // Clean dark background
      colorText: '#ffffff',                                // Pure white text
      colorIcon: '#d9d9d9',                                // Light gray icons
      colorIconHover: '#10a37f',                           // Green hover (ChatGPT Atlas)
      colorBorder: 'rgba(255, 255, 255, 0.12)',            // Subtle border
      paddingLG: 24,                                       // Larger padding
      borderRadiusLG: 16,                                  // Rounded corners
    },

    // Button - ChatGPT Atlas style
    Button: {
      colorPrimary: '#10a37f',                             // ChatGPT green primary
      colorPrimaryHover: '#1a7f64',                        // Darker green on hover
      borderRadius: 8,                                     // 8px border radius
      paddingContentHorizontal: 16,                        // 16px horizontal padding
      paddingContentVertical: 8,                           // 8px vertical padding
      fontWeight: 500,                                     // Medium weight
    },

    // Card - Fellou.ai glass morphism
    Card: {
      colorBgContainer: 'rgba(255, 255, 255, 0.06)',       // Semi-transparent background
      colorBorder: 'rgba(255, 255, 255, 0.17)',            // Subtle border
      borderRadiusLG: 24,                                  // Large rounded corners (20-24px)
      paddingLG: 32,                                       // Generous padding
    },

    // List component
    List: {
      colorBgContainer: 'transparent',                     // Transparent background
      colorText: '#ffffff',                                // Pure white text
      colorTextSecondary: '#d9d9d9',                       // Light gray secondary
      paddingLG: 16,
    },

    // Input - ChatGPT Atlas clean style
    Input: {
      colorBgContainer: 'rgba(255, 255, 255, 0.06)',       // Clean background
      colorText: '#ffffff',                                // White text
      colorTextPlaceholder: 'rgba(255, 255, 255, 0.5)',    // 50% opacity placeholder
      colorBorder: 'rgba(255, 255, 255, 0.12)',            // Subtle border
      activeBg: 'rgba(255, 255, 255, 0.08)',               // Active background
      hoverBg: 'rgba(255, 255, 255, 0.06)',                // Hover background
      activeShadow: '0 0 0 2px rgba(16, 163, 127, 0.2)',   // Focus shadow with green
      borderRadius: 12,                                    // 12px border radius
      paddingBlock: 8,                                     // Vertical padding (reduced for better alignment)
      paddingInline: 12,                                   // Horizontal padding
      controlHeight: 40,                                   // Fixed height for alignment
    },

    // Tag component
    Tag: {
      borderRadiusSM: 6,
      colorBgContainer: 'rgba(255, 255, 255, 0.06)',
    },

    // Tooltip component
    Tooltip: {
      colorBgSpotlight: 'rgba(255, 255, 255, 0.08)',
      colorTextLightSolid: '#ffffff',
      borderRadius: 8,
    },

    // Popconfirm component
    Popconfirm: {
      colorBgElevated: 'rgba(255, 255, 255, 0.08)',        // Glass background
      colorText: '#ffffff',                                // White text
      colorWarning: '#F59E0B',                             // Amber warning
      borderRadius: 10,
    },

    // Message component
    Message: {
      colorSuccess: '#10B981',
      colorError: '#EF4444',
      colorWarning: '#F59E0B',
      colorInfo: '#10a37f',                              // Green info (ChatGPT Atlas)
      colorBgElevated: 'rgba(255, 255, 255, 0.08)',
      borderRadius: 10,
    },

    // Modal - ChatGPT Atlas clean style
    Modal: {
      contentBg: '#1e1e1e',                              // Clean dark background
      headerBg: '#1e1e1e',                               // Consistent header
      footerBg: '#1e1e1e',                               // Consistent footer
      colorText: '#ffffff',                              // Pure white text
      colorBorder: 'rgba(255, 255, 255, 0.12)',          // Subtle border
      borderRadiusLG: 16,                                // Rounded corners
      paddingContentHorizontal: 32,                      // Generous padding
      paddingContentVertical: 24,
    },

    // Select component
    Select: {
      colorBgContainer: 'rgba(255, 255, 255, 0.06)',       // Select background
      colorBgElevated: 'rgba(8, 12, 16, 0.96)',            // Dropdown background
      colorText: '#ffffff',                                 // Text color
      colorBorder: 'rgba(255, 255, 255, 0.17)',            // Border color
      colorPrimaryBorder: 'rgba(16, 163, 127, 0.4)',       // Green border on focus
      activeBorderColor: 'rgba(16, 163, 127, 0.4)',        // Active border
      hoverBorderColor: 'rgba(16, 163, 127, 0.3)',         // Hover border
      borderRadius: 12,
      optionSelectedBg: 'rgba(16, 163, 127, 0.2)',          // Selected option background
      optionActiveBg: 'rgba(16, 163, 127, 0.1)',            // Active option background
    },

    // Switch component
    Switch: {
      colorPrimary: '#10a37f',                           // Green primary (ChatGPT Atlas)
      colorPrimaryHover: '#1a7f64',                      // Darker green on hover
    }
  }
};

export default theme;