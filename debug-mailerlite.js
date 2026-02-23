require('dotenv').config();
const MailerLiteService = require('./src/services/MailerLiteService');

console.log('=== MailerLite Debug ===');
console.log('');

// Check environment variables
console.log('Environment Variables:');
console.log('MAILERLITE_API_KEY:', process.env.MAILERLITE_API_KEY ? 'SET' : 'NOT SET');
console.log('MAILERLITE_GROUP_ID:', process.env.MAILERLITE_GROUP_ID || 'NOT SET');
console.log('');

// Check if service is enabled
console.log('Service Enabled:', MailerLiteService.isEnabled());
console.log('');

// Test adding a subscriber
async function testMailerLite() {
  try {
    console.log('Testing addSubscriber...');
    
    const result = await MailerLiteService.addSubscriber({
      email: 'test@example.com',
      name: 'Test User',
      phone: '+1234567890',
      providerId: 'test123'
    });
    
    console.log('Result:', result);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }
}

testMailerLite();
