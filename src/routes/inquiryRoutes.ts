import express from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const inquirySchema = z.object({
  body: z.object({
    fullName: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().min(6, 'Phone number must be at least 6 characters'),
    email: z.string().email('Invalid email address'),
    giftingType: z.string().min(2, 'Gifting method is required'),
    location: z.string().optional(),
    budget: z.string().optional(),
    details: z.string().optional(),
  }),
});

router.post('/', validate(inquirySchema), async (req, res, next) => {
  const { fullName, phone, email, giftingType, location, budget, details } = req.body;

  try {
    if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
      logger.warn('SMTP credentials are not fully configured. Logging email details instead:');
      logger.info(`--- INQUIRY FORM SUBMISSION ---
To: sales@british-chocolate.com
From: ${email}
Name: ${fullName}
Phone: ${phone}
Gifting Method: ${giftingType}
Location: ${location || 'N/A'}
Budget: ${budget || 'N/A'}
Story/Details: ${details || 'N/A'}
---------------------------------`);
      
      res.status(200).json({
        status: 'success',
        message: 'Inquiry received successfully (logged in development mode)',
      });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });

    const mailOptions = {
      from: `"${fullName}" <${config.smtp.from}>`,
      to: 'sales@british-chocolate.com',
      replyTo: email,
      subject: `New Corporate/Event Inquiry - ${fullName}`,
      text: `You have received a new Inquiry:

Name: ${fullName}
Phone: ${phone}
Email: ${email}
Gifting Method: ${giftingType}
Location: ${location || 'N/A'}
Budget: ${budget || 'N/A'}

Story or Background:
${details || 'N/A'}
`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #4A3E3D; border-bottom: 2px solid #D4A373; padding-bottom: 10px;">New Corporate/Event Inquiry</h2>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Gifting Method:</strong> ${giftingType}</p>
          <p><strong>Location:</strong> ${location || 'N/A'}</p>
          <p><strong>Budget:</strong> ${budget || 'N/A'}</p>
          <p><strong>Story or Background:</strong></p>
          <blockquote style="background: #f9f9f9; border-left: 5px solid #D4A373; margin: 1.5em 10px; padding: 10px 20px; font-style: italic;">
            ${details ? details.replace(/\n/g, '<br />') : 'N/A'}
          </blockquote>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #888;">This email was sent from the Inquiry form on British Chocolate.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email successfully sent to sales@british-chocolate.com for submission by ${fullName}`);

    res.status(200).json({
      status: 'success',
      message: 'Your inquiry has been successfully submitted.',
    });
  } catch (error) {
    logger.error('Error sending inquiry email:', error);
    next(error);
  }
});

export default router;
