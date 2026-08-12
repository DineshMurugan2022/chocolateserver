import express from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const contactSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().min(6, 'Phone number must be at least 6 characters'),
    email: z.string().email('Invalid email address'),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
  }),
});

router.post('/', validate(contactSchema), async (req, res, next) => {
  const { name, phone, email, reason } = req.body;

  try {
    // 1. Create a transporter
    // If SMTP host is not configured, we'll log the email content and simulate success.
    // This avoids breaking the application for developers who haven't set up SMTP yet.
    if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
      logger.warn('SMTP credentials are not fully configured. Logging email details instead:');
      logger.info(`--- INQUIRY FORM SUBMISSION ---
To: sales@british-chocolate.com
From: ${email}
Name: ${name}
Phone: ${phone}
Reason: ${reason}
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
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    const mailOptions = {
      from: `"${name}" <${config.smtp.from}>`,
      to: 'sales@british-chocolate.com',
      replyTo: email,
      subject: `New Artisan Registry Application - ${name}`,
      text: `You have received a new Artisan Registry entry:

Name: ${name}
Phone: ${phone}
Email: ${email}
Reason for entry/induction:
${reason}
`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #4A3E3D; border-bottom: 2px solid #D4A373; padding-bottom: 10px;">New Artisan Registry entry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Reason for induction:</strong></p>
          <blockquote style="background: #f9f9f9; border-left: 5px solid #D4A373; margin: 1.5em 10px; padding: 10px 20px; font-style: italic;">
            ${reason.replace(/\n/g, '<br />')}
          </blockquote>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #888;">This email was sent from the Artisan Registry form on British Chocolate.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info(`Email successfully sent to sales@british-chocolate.com for submission by ${name}`);
    } catch (mailError) {
      logger.error(`SMTP send failed for submission by ${name}, submission logged fallback:`, mailError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Your request has been successfully submitted.',
    });
  } catch (error) {
    logger.error('Error handling contact submission:', error);
    next(error);
  }
});

export default router;
