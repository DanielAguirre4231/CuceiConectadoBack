const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: true, // puerto 465 utiliza SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Envía un correo electrónico real con el código de verificación
 */
const sendVerificationCode = async (toEmail, code) => {
  const mailOptions = {
    from: `"CUCEI Conectado" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: '🔑 Código de Verificación - CUCEI Conectado',
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #0b192c; color: #ffffff; padding: 30px; border-radius: 12px; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #f39c12; margin-top: 0;">¡Bienvenido a CUCEI Conectado!</h2>
        <p style="color: #cbd5e1; font-size: 14px;">Ingresa el siguiente código de 6 dígitos en la plataforma para activar tu cuenta:</p>
        <div style="background-color: #1e3e62; padding: 15px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #f39c12; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Este código vence en 15 minutos. Si no creaste una cuenta, ignora este mensaje.</p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationCode };