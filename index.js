// Required dependencies
const express = require('express');
const dotenv = require('dotenv');
const twilio = require('twilio');
const crypto = require('crypto');

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store OTPs (in production, use a proper database)
const otpStore = new Map();

// Generate a random 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Validate phone number format (basic validation)
function isValidPhoneNumber(phone) {
  const phoneRegex = /^\+\d{1,3}\d{10}$/;  // Format: +CountryCodeNumber
  return phoneRegex.test(phone);
}

// Route to send OTP
app.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    // Validate phone number
    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format. Use format: +CountryCodeNumber' 
      });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with timestamp
    otpStore.set(phoneNumber, {
      otp,
      timestamp: Date.now(),
      attempts: 0
    });

    // Send OTP via Twilio
    await twilioClient.messages.create({
      body: `Your OTP is: ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Route to verify OTP
app.post('/verify-otp', (req, res) => {
  const { phoneNumber, otp } = req.body;

  // Get stored OTP data
  const otpData = otpStore.get(phoneNumber);

  if (!otpData) {
    return res.status(400).json({ error: 'No OTP found for this number' });
  }

  // Check if OTP is expired (5 minutes)
  if (Date.now() - otpData.timestamp > 5 * 60 * 1000) {
    otpStore.delete(phoneNumber);
    return res.status(400).json({ error: 'OTP expired' });
  }

  // Check if max attempts reached (3 attempts)
  if (otpData.attempts >= 3) {
    otpStore.delete(phoneNumber);
    return res.status(400).json({ error: 'Max verification attempts reached' });
  }

  // Verify OTP
  if (otpData.otp === otp) {
    otpStore.delete(phoneNumber);
    return res.json({ message: 'OTP verified successfully' });
  }

  // Increment attempts
  otpData.attempts += 1;
  otpStore.set(phoneNumber, otpData);

  res.status(400).json({ error: 'Invalid OTP' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

