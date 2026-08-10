import express from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const workshopSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().min(6, 'Phone number must be at least 6 characters'),
    email: z.string().email('Invalid email address'),
    attendees: z.string().min(1, 'Number of attendees is required'),
    preferredDate: z.string().optional(),
  }),
});

router.post('/', validate(workshopSchema), async (req, res, next) => {
  const { fullName, phone, email, attendees, preferredDate } = req.body;

  try {
    if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
      logger.warn('SMTP credentials are not fully configured. Logging email details instead:');
      logger.info(`--- WORKSHOP APPLICATION SUBMISSION ---
To: sales@british-chocolate.com
From: ${email}
Name: ${fullName}
Phone: ${phone}
Attendees: ${attendees}
Preferred Date: ${preferredDate || 'N/A'}
---------------------------------`);
      
      res.status(200).json({
        status: 'success',
        message: 'Application received successfully (logged in development mode)',
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
      subject: `New Workshop Application - ${fullName}`,
      text: `You have received a new Workshop Application:

Name: ${fullName}
Phone: ${phone}
Email: ${email}
Number of Attendees: ${attendees}
Preferred Date: ${preferredDate || 'N/A'}
`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #4A3E3D; border-bottom: 2px solid #D4A373; padding-bottom: 10px;">New Workshop Application</h2>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Number of Attendees:</strong> ${attendees}</p>
          <p><strong>Preferred Date:</strong> ${preferredDate || 'N/A'}</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #888;">This email was sent from the Workshop Application form on British Chocolate.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email successfully sent to sales@british-chocolate.com for workshop application by ${fullName}`);

    res.status(200).json({
      status: 'success',
      message: 'Your workshop application has been successfully submitted.',
    });
  } catch (error) {
    logger.error('Error sending workshop application email:', error);
    next(error);
  }
});

export default router;
