const express = require('express');
const router = express.Router();
const pool = require('../db'); 
const bcrypt = require('bcrypt'); // CIFRADO DE CONTRASEÑAS //
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationCode } = require('../utils/mailer');

// Helper: Generador de código aleatorio de 6 dígitos
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// ROUTE: /api/users //

// LOGIN //
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son obligatorios" });
    }

    try {
        const query = 'SELECT * FROM public.USERS WHERE EMAIL_USERS = $1';
        const result = await pool.query(query, [email.trim().toLowerCase()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Credenciales incorrectas" });
        }

        const user = result.rows[0];

        // A. Comprobar que la cuenta esté ACTIVADA por correo
        if (!user.is_active) {
            return res.status(403).json({ error: "Tu cuenta aún no está activada. Revisa tu correo electrónico para verificar tu código." });
        }

        // B. Verificación criptográfica de la contraseña
        const isMatch = await bcrypt.compare(password, user.password_users);
        if (!isMatch) {
            return res.status(401).json({ error: "Credenciales incorrectas" });
        }

        // C. Generación del Token de Sesión Segura (JWT)
        const token = jwt.sign(
            { 
                id: user.id_users, 
                email: user.email_users,
                code: user.student_code_users 
            },
            process.env.JWT_SECRET || 'clave_secreta_cucei',
            { expiresIn: '8h' } // Expiración de sesión
        );

        res.json({
            message: "Login Exitoso",
            token: token,
            user: {
                id: user.id_users,
                code: user.student_code_users,
                name: user.first_name_users,
                first_name_users: user.first_name_users,
                last_name: user.last_name_users,
                last_name_users: user.last_name_users,
                last_name_m: user.last_name_m_users,       // <-- Añadido
                last_name_m_users: user.last_name_m_users, // <-- Añadido
                email: user.email_users,
                major: user.major_users,
                major_users: user.major_users
            }
        });

    } catch (err) {
        console.error("Error en /login:", err.message);
        res.status(500).json({ error: "Error en el servidor al autenticar" });
    }
});

// GET ALL //
router.get('/getAllUsers', async (req, res) => {
    try {
        const query = `
            SELECT ID_USERS, STUDENT_CODE_USERS, EMAIL_USERS, FIRST_NAME_USERS, LAST_NAME_USERS, LAST_NAME_M_USERS, MAJOR_USERS, INTERESTS, CREATED_AT 
            FROM public.USERS 
            ORDER BY CREATED_AT DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "ERROR /getAllUsers" });
    }
});

// GET ONE BY ID //
router.get('/getOneUserById/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT ID_USERS, STUDENT_CODE_USERS, EMAIL_USERS, FIRST_NAME_USERS, LAST_NAME_USERS, LAST_NAME_M_USERS, MAJOR_USERS, INTERESTS, CREATED_AT 
            FROM public.USERS 
            WHERE ID_USERS = $1
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        if (err.code === '22P02') {
            return res.status(400).json({ error: "Invalid User ID" });
        }
        res.status(500).json({ error: "ERROR /getOneByID" });
    }
});

// INSERT / REGISTRO //
router.post('/insertUser', async (req, res) => {
    const { 
        student_code, 
        email, 
        password, 
        first_name_users, 
        last_name_users, 
        last_name_m_users, 
        major, 
        id_uni_center 
    } = req.body;

    const userEmail = (email || '').trim().toLowerCase();

    if (!userEmail || !password) {
        return res.status(400).json({ error: "El correo y la contraseña son obligatorios." });
    }

    try {
        // 1. Verificar si el correo ya existe
        const userCheck = await pool.query('SELECT * FROM public.USERS WHERE EMAIL_USERS = $1', [userEmail]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
        }

        // 2. Cifrar contraseña y generar código de 6 dígitos
        const hashedPassword = await bcrypt.hash(password, 10);
        const code = generateCode();
        const tokenExpires = new Date(Date.now() + 15 * 60 * 1000); // Válido por 15 minutos

        // 3. Insertar usuario con todos sus datos recibidos de Register.jsx
        const insertQuery = `
            INSERT INTO public.USERS (
                STUDENT_CODE_USERS,
                FIRST_NAME_USERS, 
                LAST_NAME_USERS, 
                LAST_NAME_M_USERS, 
                EMAIL_USERS, 
                PASSWORD_USERS, 
                MAJOR_USERS, 
                ID_UNI_CENTERS_USERS, 
                VERIFICATION_TOKEN, 
                IS_ACTIVE, 
                TOKEN_EXPIRES
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10)
            RETURNING ID_USERS, EMAIL_USERS
        `;

        const values = [
            student_code || null,
            first_name_users || null,
            last_name_users || null,
            last_name_m_users || null,
            userEmail,
            hashedPassword,
            major || null,
            id_uni_center ? parseInt(id_uni_center, 10) : 1,
            code,
            tokenExpires
        ];

        await pool.query(insertQuery, values);

        // 4. Enviar el correo real mediante Nodemailer
        try {
            await sendVerificationCode(userEmail, code);
        } catch (mailErr) {
            console.error('Error enviando el correo SMTP:', mailErr);
            return res.status(500).json({ 
                error: 'Usuario guardado pero no se pudo enviar el correo de verificación. Revisa la configuración SMTP.' 
            });
        }

        res.status(201).json({
            message: 'Usuario registrado correctamente. Se ha enviado un código de activación a tu correo.',
            email: userEmail
        });

    } catch (err) {
        console.error('Error detallado en /insertUser:', err);
        res.status(500).json({ error: 'Error al registrar usuario', message: err.message });
    }
});

// ACTIVACIÓN DE USUARIO//
router.post('/verifyEmail', async (req, res) => {
    const { email, code, token } = req.body;
    const inputToken = code || token;
    const userEmail = (email || '').trim().toLowerCase();

    if (!inputToken) {
        return res.status(400).json({ error: "Código de verificación no proporcionado." });
    }

    try {
        let query = '';
        let params = [];

        if (userEmail) {
            query = 'SELECT * FROM public.USERS WHERE EMAIL_USERS = $1;';
            params = [userEmail];
        } else {
            query = 'SELECT * FROM public.USERS WHERE VERIFICATION_TOKEN = $1;';
            params = [inputToken];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuario o código no encontrado." });
        }

        const user = result.rows[0];

        if (user.is_active) {
            return res.status(400).json({ error: "Esta cuenta ya ha sido activada previamente." });
        }

        if (user.verification_token !== inputToken) {
            return res.status(400).json({ error: "El código de verificación es incorrecto." });
        }

        if (new Date() > new Date(user.token_expires)) {
            return res.status(400).json({ error: "El código de verificación ha expirado. Solicita uno nuevo." });
        }

        // Activar la cuenta y limpiar token
        await pool.query(
            'UPDATE public.USERS SET IS_ACTIVE = TRUE, VERIFICATION_TOKEN = NULL, TOKEN_EXPIRES = NULL WHERE ID_USERS = $1',
            [user.id_users]
        );

        // Generar Token de sesión automática
        const jwtToken = jwt.sign(
            { id: user.id_users, email: user.email_users },
            process.env.JWT_SECRET || 'clave_secreta_cucei',
            { expiresIn: '8h' }
        );

        res.json({
            message: "¡Cuenta activada con éxito! Ya puedes usar la plataforma.",
            token: jwtToken,
            user: {
                id: user.id_users,
                email: user.email_users,
                name: user.first_name_users,
                first_name_users: user.first_name_users,
                last_name: user.last_name_users,
                last_name_users: user.last_name_users,
                last_name_m: user.last_name_m_users,       // <-- Añadido
                last_name_m_users: user.last_name_m_users, // <-- Añadido
                major: user.major_users,
                major_users: user.major_users
            }
        });
    } catch (err) {
        console.error("Error en /verifyEmail:", err.message);
        res.status(500).json({ error: "Error interno al activar la cuenta" });
    }
});

// Soporte para enlace directo GET (si abren el enlace desde un correo)
router.get('/verifyEmail', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ error: "Token de activación no proporcionado." });
    }

    try {
        const query = 'SELECT * FROM public.USERS WHERE VERIFICATION_TOKEN = $1 AND IS_ACTIVE = FALSE;';
        const result = await pool.query(query, [token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "El enlace es inválido o la cuenta ya fue activada." });
        }

        const user = result.rows[0];
        if (new Date() > new Date(user.token_expires)) {
            return res.status(400).json({ error: "El enlace de verificación ha expirado. Debes solicitar uno nuevo." });
        }

        await pool.query(
            'UPDATE public.USERS SET IS_ACTIVE = TRUE, VERIFICATION_TOKEN = NULL, TOKEN_EXPIRES = NULL WHERE ID_USERS = $1',
            [user.id_users]
        );

        res.json({ message: "¡Cuenta activada con éxito! Ya puedes iniciar sesión." });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Error interno al activar la cuenta" });
    }
});

// REENVIAR CÓDIGO //
router.post('/resendCode', async (req, res) => {
    const { email } = req.body;
    const userEmail = (email || '').trim().toLowerCase();

    if (!userEmail) {
        return res.status(400).json({ error: "El correo es obligatorio." });
    }

    try {
        const code = generateCode();
        const tokenExpires = new Date(Date.now() + 15 * 60 * 1000);

        const result = await pool.query(
            'UPDATE public.USERS SET VERIFICATION_TOKEN = $1, TOKEN_EXPIRES = $2 WHERE EMAIL_USERS = $3 RETURNING EMAIL_USERS',
            [code, tokenExpires, userEmail]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        await sendVerificationCode(userEmail, code);
        res.json({ message: "Se ha enviado un nuevo código a tu correo." });

    } catch (err) {
        console.error("Error en /resendCode:", err.message);
        res.status(500).json({ error: "Error al reenviar el código" });
    }
});

// UPDATE //
router.put('/updateUser/:id', async (req, res) => {
    const { id } = req.params;
    const { first_name_users, last_name_users, last_name_m_users, major, id_uni_center, interests } = req.body;

    try {
        const query = `
            UPDATE public.USERS 
            SET 
                FIRST_NAME_USERS      = COALESCE($1, FIRST_NAME_USERS),
                LAST_NAME_USERS       = COALESCE($2, LAST_NAME_USERS),
                LAST_NAME_M_USERS     = COALESCE($3, LAST_NAME_M_USERS),
                MAJOR_USERS           = COALESCE($4, MAJOR_USERS),
                ID_UNI_CENTERS_USERS  = COALESCE($5, ID_UNI_CENTERS_USERS),
                INTERESTS             = COALESCE($6, INTERESTS)
            WHERE ID_USERS = $7
            RETURNING 
                id_users,
                student_code_users,
                email_users,
                first_name_users,
                last_name_users,
                last_name_m_users,
                major_users,
                id_uni_centers_users,
                interests,
                created_at
            `;

        const values = [
            first_name_users,    
            last_name_users,   
            last_name_m_users,   
            major,               
            id_uni_center,       
            interests ? JSON.stringify(interests) : null, 
            id                   
        ];

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const updatedRow = result.rows[0];
        return res.json({
            message: "User Updated Successfully",
            user: {
                id: updatedRow.id_users,
                id_users: updatedRow.id_users,
                code: updatedRow.student_code_users,
                email: updatedRow.email_users,
                name: updatedRow.first_name_users,
                first_name_users: updatedRow.first_name_users,
                last_name: updatedRow.last_name_users,
                last_name_users: updatedRow.last_name_users,
                last_name_m: updatedRow.last_name_m_users,       // <-- Añadido
                last_name_m_users: updatedRow.last_name_m_users, // <-- Añadido
                major: updatedRow.major_users,
                major_users: updatedRow.major_users,
                interests: updatedRow.interests
            }
        });

    } catch (err) {
        console.error("Error en Update:", err.message);
        return res.status(500).json({ error: "ERROR /updateUser" });
    }
});

// UPDATE EMAIL //
router.put('/updateEmail/:id', async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;

    // VALIDACIÓN DE DOMINIO INSTITUCIONAL //
    if (!email || !email.endsWith('.udg.mx')) {
        return res.status(400).json({ 
            error: "Acceso denegado. Solo se permiten correos institucionales (@alumnos.udg.mx o @academicos.udg.mx)" 
        });
    }

    try {
        const emailCheck = await pool.query(
            'SELECT id_users FROM public.USERS WHERE email_users = $1 AND id_users != $2', 
            [email, id]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: "Este correo ya está registrado por otro usuario." });
        }

        const result = await pool.query(
            'UPDATE public.USERS SET email_users = $1 WHERE id_users = $2 RETURNING email_users', 
            [email, id]
        );

        res.json({ 
            message: "Correo institucional actualizado con éxito", 
            email: result.rows[0].email_users 
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Error interno al intentar actualizar el correo" });
    }
});

// UPDATE PASSWORD //
router.put('/updatePassword/:id', async (req, res) => {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#._\-+])[A-Za-z\d@$!%*?&#._\-+]{8,}$/;

    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ 
            error: "La nueva contraseña no es lo suficientemente segura.",
            requirements: "Debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&)."
        });
    }

    try {
        const userResult = await pool.query('SELECT password_users FROM public.USERS WHERE id_users = $1', [id]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password_users);
        if (!isMatch) return res.status(401).json({ error: "La contraseña actual es incorrecta" });

        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE public.USERS SET password_users = $1 WHERE id_users = $2', [hashedNewPassword, id]);

        res.json({ message: "Contraseña actualizada con éxito"});

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;