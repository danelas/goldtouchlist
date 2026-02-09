# WordPress User Creation Webhook - Implementation Summary

## ✅ What We've Built

### 1. **Webhook Endpoint**
- **URL:** `https://pay.goldtouchlist.com/webhooks/wordpress/user-created`
- **Method:** POST
- **Security:** Optional webhook secret validation
- **Auto-generates:** Unique provider IDs (provider1, provider2, etc.)

### 2. **Database Integration**
- **Links WordPress users** to Gold Touch List providers
- **Stores:** phone, email, user_id, service areas
- **Auto-sets:** verification status, SMS preferences
- **Tracks:** first lead usage for free lead system

### 3. **Provider Creation Process**
When WordPress sends user data:
1. **Validates** required fields (user_id, email)
2. **Generates** unique provider ID automatically
3. **Creates** provider record with all user data
4. **Links** WordPress user_id to provider account
5. **Returns** success response with provider ID

## 🔧 WordPress Integration Options

### Option A: Functions.php (Simplest)
Add to your theme's `functions.php`:

```php
function gtl_send_user_creation_webhook($user_id) {
    $user = get_user_by('id', $user_id);
    if (!$user) return;
    
    $payload = array(
        'user_id' => $user_id,
        'email' => $user->user_email,
        'name' => $user->display_name ?: ($user->first_name . ' ' . $user->last_name),
        'display_name' => $user->display_name,
        'first_name' => $user->first_name,
        'last_name' => $user->last_name,
        'phone' => get_user_meta($user_id, 'phone', true), // Adjust field name
        'user_login' => $user->user_login,
        'service_areas' => array(), // Customize as needed
    );
    
    wp_remote_post('https://pay.goldtouchlist.com/webhooks/wordpress/user-created', array(
        'method' => 'POST',
        'headers' => array('Content-Type' => 'application/json'),
        'body' => json_encode($payload)
    ));
}
add_action('user_register', 'gtl_send_user_creation_webhook');
```

### Option B: HivePress Specific
For HivePress theme users:

```php
function gtl_hivepress_provider_webhook($user_id, $user_data) {
    $payload = array(
        'user_id' => $user_id,
        'email' => $user_data['user_email'],
        'name' => $user_data['display_name'] ?: ($user_data['first_name'] . ' ' . $user_data['last_name']),
        'display_name' => $user_data['display_name'],
        'first_name' => $user_data['first_name'],
        'last_name' => $user_data['last_name'],
        'phone' => get_user_meta($user_id, 'hp_phone', true), // HivePress phone field
        'service_areas' => array(get_user_meta($user_id, 'hp_location', true))
    );
    
    wp_remote_post('https://pay.goldtouchlist.com/webhooks/wordpress/user-created', array(
        'method' => 'POST',
        'headers' => array('Content-Type' => 'application/json'),
        'body' => json_encode($payload)
    ));
}
add_action('hivepress/v1/models/user/create', 'gtl_hivepress_provider_webhook', 10, 2);
```

## 🧪 Testing

### 1. **Test Webhook Endpoint**
Visit: `https://pay.goldtouchlist.com/webhooks/wordpress/user-created`

Should return:
```json
{
  "message": "WordPress user creation webhook endpoint is ready",
  "status": "ready"
}
```

### 2. **Test User Creation**
POST to: `https://your-domain.com/webhooks/test/wordpress-user`

With payload:
```json
{
  "email": "test@example.com",
  "display_name": "Test Provider",
  "phone": "+1234567890"
}
```

### 3. **Verify Provider Creation**
Check your database:
```sql
SELECT id, name, email, phone, wordpress_user_id 
FROM providers 
ORDER BY created_at DESC 
LIMIT 5;
```

## 🔐 Security Setup

### 1. **Environment Variables**
Add to your `.env` file:
```
WORDPRESS_WEBHOOK_SECRET=your-secure-secret-here
```

### 2. **WordPress Security**
In your WordPress code, add:
```php
'headers' => array(
    'Content-Type' => 'application/json',
    'X-Webhook-Secret' => 'your-secure-secret-here'
)
```

## 📋 Field Mapping

| WordPress Field | Provider Field | Auto-Generated | Required |
|----------------|----------------|----------------|----------|
| `ID` | `wordpress_user_id` | No | Yes |
| `user_email` | `email` | No | Yes |
| `name` | `name` | No | No |
| `display_name` | `name` | No | No |
| `first_name` + `last_name` | `name` | No | No |
| `user_login` | `slug` | No | No |
| Custom phone | `phone` | No | No |
| Custom areas | `service_areas` | No | No |
| - | `id` | **Yes** | Yes |
| - | `first_lead_used` | **Yes** (false) | Yes |
| - | `is_verified` | **Yes** (false) | Yes |
| - | `sms_opted_out` | **Yes** (auto) | Yes |

## 🚀 Next Steps

### 1. **WordPress Side**
- [ ] Choose integration method (functions.php vs plugin)
- [ ] Identify your phone number field name
- [ ] Customize service areas logic
- [ ] Add webhook secret for security
- [ ] Test with real user registration

### 2. **Gold Touch List Side**
- [ ] Set `WORDPRESS_WEBHOOK_SECRET` in environment
- [ ] Test webhook endpoint
- [ ] Monitor provider creation logs
- [ ] Verify lead distribution works

### 3. **HivePress Specific**
- [ ] Find HivePress registration form location
- [ ] Identify HivePress field names (hp_phone, hp_location, etc.)
- [ ] Test with HivePress user registration flow
- [ ] Customize for HivePress provider types

## 🔍 Troubleshooting

### Common Issues

1. **Webhook not firing**
   - Check WordPress error logs
   - Verify hook is added correctly
   - Test with manual user registration

2. **401 Unauthorized**
   - Check webhook secret matches
   - Verify header format

3. **Provider not created**
   - Check server logs
   - Verify database permissions
   - Test webhook endpoint directly

4. **Missing phone number**
   - User will be created but SMS disabled
   - Update phone field name in WordPress code

### Debug Steps

1. **Enable WordPress debugging:**
   ```php
   define('WP_DEBUG', true);
   define('WP_DEBUG_LOG', true);
   ```

2. **Check logs:**
   - WordPress: `/wp-content/debug.log`
   - Server: Your application logs

3. **Test manually:**
   - Use test endpoint: `/webhooks/test/wordpress-user`
   - Check database after test

## 📞 Support

If you need help:
1. Check the `WORDPRESS_INTEGRATION.md` file for detailed instructions
2. Test the webhook endpoint first
3. Verify WordPress hooks are firing
4. Check both WordPress and server logs
5. Use the test endpoints to isolate issues

## 🎯 Key Benefits

✅ **Automatic provider creation** - No manual setup needed
✅ **Unique ID generation** - Handles provider numbering automatically  
✅ **WordPress linking** - Full integration with existing users
✅ **Phone number support** - SMS notifications when available
✅ **Service area mapping** - Geographic lead targeting
✅ **Security built-in** - Webhook secret validation
✅ **Easy testing** - Test endpoints for debugging
