# WordPress/HivePress Integration Guide

This guide explains how to integrate WordPress user registration with the Gold Touch List lead system.

## Overview

When a user registers on your WordPress/HivePress site, this integration will:
1. **Auto-generate** a unique provider ID (provider1, provider2, etc.)
2. **Create** a provider record with phone, email, and user ID
3. **Link** the WordPress user to the Gold Touch List system
4. **Enable** the user to receive leads immediately

## Webhook Endpoint

**URL:** `https://pay.goldtouchlist.com/webhooks/wordpress/user-created`
**Method:** POST
**Content-Type:** application/json

## Required Payload Structure

```json
{
  "user_id": 123,
  "email": "provider@example.com",
  "name": "John Doe",
  "display_name": "John Doe",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "user_login": "johndoe",
  "service_areas": ["Miami", "Fort Lauderdale"]
}
```

### Required Fields
- `user_id` - WordPress user ID (integer)
- `email` - User's email address

### Optional Fields
- `name` - Direct name field (highest priority)
- `display_name` - Full name for display
- `first_name` - First name only
- `last_name` - Last name only (combined with first_name if both present)
- `phone` - Phone number (if missing, SMS will be disabled)
- `user_login` - WordPress username
- `service_areas` - Array of service areas

## WordPress Implementation Options

### Option 1: Functions.php Hook (Recommended)

Add this code to your theme's `functions.php` file:

```php
<?php
// Gold Touch List - User Registration Webhook
function gtl_send_user_creation_webhook($user_id) {
    $user = get_user_by('id', $user_id);
    if (!$user) return;
    
    // Get user meta data (adjust field names for your setup)
    $phone = get_user_meta($user_id, 'phone', true);
    $service_areas = get_user_meta($user_id, 'service_areas', true);
    
    // Prepare webhook payload
    $payload = array(
        'user_id' => $user_id,
        'email' => $user->user_email,
        'name' => $user->display_name ?: ($user->first_name . ' ' . $user->last_name),
        'display_name' => $user->display_name,
        'first_name' => $user->first_name,
        'last_name' => $user->last_name,
        'user_login' => $user->user_login,
        'phone' => $phone,
        'service_areas' => is_array($service_areas) ? $service_areas : array(),
        'webhook_secret' => 'your-webhook-secret-here' // Optional security
    );
    
    // Send webhook
    $response = wp_remote_post('https://pay.goldtouchlist.com/webhooks/wordpress/user-created', array(
        'method' => 'POST',
        'timeout' => 30,
        'headers' => array(
            'Content-Type' => 'application/json',
            'X-Webhook-Secret' => 'your-webhook-secret-here'
        ),
        'body' => json_encode($payload)
    ));
    
    // Log response for debugging
    if (is_wp_error($response)) {
        error_log('GTL Webhook Error: ' . $response->get_error_message());
    } else {
        error_log('GTL Webhook Success: ' . wp_remote_retrieve_body($response));
    }
}

// Hook into user registration
add_action('user_register', 'gtl_send_user_creation_webhook');

// Also hook into profile updates (in case phone is added later)
add_action('profile_update', 'gtl_send_user_creation_webhook');
?>
```

### Option 2: HivePress Specific Hook

If using HivePress theme, use their specific hooks:

```php
<?php
// HivePress - Provider Registration Webhook
function gtl_hivepress_provider_webhook($user_id, $user_data) {
    // Get HivePress specific fields
    $phone = get_user_meta($user_id, 'hp_phone', true);
    $location = get_user_meta($user_id, 'hp_location', true);
    
    $payload = array(
        'user_id' => $user_id,
        'email' => $user_data['user_email'],
        'name' => $user_data['display_name'] ?: ($user_data['first_name'] . ' ' . $user_data['last_name']),
        'display_name' => $user_data['display_name'],
        'first_name' => $user_data['first_name'],
        'last_name' => $user_data['last_name'],
        'user_login' => $user_data['user_login'],
        'phone' => $phone,
        'service_areas' => array($location),
        'webhook_secret' => 'your-webhook-secret-here'
    );
    
    wp_remote_post('https://pay.goldtouchlist.com/webhooks/wordpress/user-created', array(
        'method' => 'POST',
        'timeout' => 30,
        'headers' => array(
            'Content-Type' => 'application/json',
            'X-Webhook-Secret' => 'your-webhook-secret-here'
        ),
        'body' => json_encode($payload)
    ));
}

// Hook into HivePress provider registration
add_action('hivepress/v1/models/user/create', 'gtl_hivepress_provider_webhook', 10, 2);
?>
```

### Option 3: Plugin Approach

Create a simple plugin file `wp-content/plugins/gtl-integration/gtl-integration.php`:

```php
<?php
/**
 * Plugin Name: Gold Touch List Integration
 * Description: Integrates WordPress user registration with Gold Touch List
 * Version: 1.0
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class GTL_Integration {
    
    private $webhook_url = 'https://pay.goldtouchlist.com/webhooks/wordpress/user-created';
    private $webhook_secret = 'your-webhook-secret-here';
    
    public function __construct() {
        add_action('user_register', array($this, 'send_webhook'));
        add_action('profile_update', array($this, 'send_webhook'));
    }
    
    public function send_webhook($user_id) {
        $user = get_user_by('id', $user_id);
        if (!$user) return;
        
        $payload = array(
            'user_id' => $user_id,
            'email' => $user->user_email,
            'display_name' => $user->display_name,
            'first_name' => $user->first_name,
            'user_login' => $user->user_login,
            'phone' => get_user_meta($user_id, 'phone', true),
            'service_areas' => $this->get_service_areas($user_id),
            'webhook_secret' => $this->webhook_secret
        );
        
        wp_remote_post($this->webhook_url, array(
            'method' => 'POST',
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-Webhook-Secret' => $this->webhook_secret
            ),
            'body' => json_encode($payload)
        ));
    }
    
    private function get_service_areas($user_id) {
        // Customize this based on how you store service areas
        $areas = get_user_meta($user_id, 'service_areas', true);
        return is_array($areas) ? $areas : array();
    }
}

new GTL_Integration();
?>
```

## Configuration Steps

### 1. Set Environment Variables

Add to your `.env` file:
```
WORDPRESS_WEBHOOK_SECRET=your-secure-webhook-secret-here
```

### 2. Update WordPress Code

Choose one of the implementation options above and:
- Replace `https://pay.goldtouchlist.com` with your actual domain (already set correctly)
- Replace `your-webhook-secret-here` with your actual secret
- Adjust field names to match your WordPress/HivePress setup

### 3. Test the Integration

Visit: `https://pay.goldtouchlist.com/webhooks/wordpress/user-created`

You should see:
```json
{
  "message": "WordPress user creation webhook endpoint is ready",
  "status": "ready"
}
```

### 4. Test User Registration

1. Register a new user on your WordPress site
2. Check your server logs for webhook activity
3. Verify the provider was created in your database

## Field Mapping

| WordPress Field | Gold Touch List Field | Required | Notes |
|----------------|----------------------|----------|-------|
| `ID` | `wordpress_user_id` | Yes | Links accounts |
| `user_email` | `email` | Yes | Primary identifier |
| `name` | `name` | No | Direct name field (highest priority) |
| `display_name` | `name` | No | Falls back if no direct name |
| `first_name` + `last_name` | `name` | No | Combined if both present |
| `first_name` | `name` | No | Used if no other name fields |
| `user_login` | `slug` | No | URL-friendly identifier |
| Custom phone field | `phone` | No | Enables SMS notifications |
| Custom areas field | `service_areas` | No | Geographic targeting |

## Troubleshooting

### Common Issues

1. **Webhook not firing**: Check WordPress error logs
2. **401 Unauthorized**: Verify webhook secret matches
3. **400 Bad Request**: Check payload structure
4. **Provider not created**: Check database permissions

### Debug Mode

Enable WordPress debug logging in `wp-config.php`:
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

Check logs at `/wp-content/debug.log`

## Security Considerations

1. **Use HTTPS** for webhook URLs
2. **Set webhook secret** for authentication
3. **Validate payload** on both ends
4. **Rate limit** webhook calls if needed

## Next Steps

After integration:
1. Test with real user registrations
2. Monitor webhook success rates
3. Set up provider verification process
4. Configure lead distribution rules

## Support

For issues with this integration:
1. Check server logs for webhook errors
2. Verify WordPress hooks are firing
3. Test webhook endpoint directly
4. Contact Gold Touch List support with logs
