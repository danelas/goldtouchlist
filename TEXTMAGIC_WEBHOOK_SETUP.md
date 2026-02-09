# TextMagic Webhook Configuration

## 🔧 **Configure TextMagic to Send JSON**

### **1. Login to TextMagic Dashboard**
- Go to your TextMagic account
- Navigate to **Settings** → **Webhooks** or **API Settings**

### **2. Set Up Incoming SMS Webhook**

**Webhook URL:**
```
https://pay.goldtouchlist.com/webhooks/sms/incoming
```

**Method:** `POST`

**Content-Type:** `application/json`

**Expected JSON Format:**
```json
{
  "from": "+19546144683",
  "text": "Y",
  "messageId": "12345",
  "timestamp": "2025-11-03T22:08:42Z"
}
```

### **3. Common TextMagic Field Names**

Your webhook will accept any of these field variations:

**Phone Number:**
- `from`, `sender`, `phone`, `number`
- `From`, `Sender`, `Phone`, `Number`
- `phoneNumber`, `senderNumber`

**Message Text:**
- `text`, `message`, `body`, `content`
- `Text`, `Message`, `Body`, `Content`
- `messageText`, `sms`, `SMS`

**Message ID:**
- `message_id`, `messageId`, `id`
- `Message_ID`, `MessageId`, `ID`
- `msgId`, `msg_id`

### **4. Test the Webhook**

**Test URL (GET):**
```
https://pay.goldtouchlist.com/webhooks/sms/incoming
```

**Expected Response:**
```json
{
  "message": "SMS webhook is working",
  "method": "GET",
  "instructions": "TextMagic should send POST requests here"
}
```

### **5. Example Working JSON Payload**

```json
{
  "from": "+19546144683",
  "text": "Y",
  "messageId": "1308678932"
}
```

## 🎯 **Why JSON is Better:**

- ✅ **Simpler parsing** - no multipart form handling needed
- ✅ **More reliable** - standard format
- ✅ **Better debugging** - easy to read logs
- ✅ **Consistent** - matches other webhooks (Stripe, FluentForms)

## 🚀 **Next Steps:**

1. **Configure TextMagic** to send JSON to the webhook URL
2. **Run the database migration** at `/fix-database`
3. **Test with "Y" reply** to an SMS
4. **Should receive Stripe payment link**

The webhook is ready - just needs JSON format from TextMagic! 🎉
