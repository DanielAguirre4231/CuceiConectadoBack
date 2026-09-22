const express = require('express');
const router = express.Router();
const pool = require('../db'); 
const bcrypt = require('bcrypt'); //CIFRADO DE CONTRASEÑAS//

// ROUTE: /api/users //

//LOGIN//
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son obligatorios" });
    }
    try {
        //BUSCAR USUARO POR EMAIL//
        const query = 'SELECT * FROM public.USERS WHERE EMAIL_USERS = $1';
        const result = await pool.query(query, [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Email not found" });
        }

        const user = result.rows[0];

        //Comparar la contraseña enviada con el HASH de la base de datos//
        const isMatch = await bcrypt.compare(password, user.password_users);
        
        if (!isMatch) {
            return res.status(401).json({ error: "Incorrect password" });
        }

        res.json({
            message: "Login Succesfully",
            user: {
                id: user.id_users,
                code: user.student_code_users,
                name: user.first_name_users,
                last_name: user.last_name_users,
                last_name_m: user.last_name_m_users ,
                email: user.email_users,
                major: user.major_users
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "ERROR /login" });
    }
});

//GET ALL//
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
        if (err.code === '23505') {
            return res.status(400).json({ error: "" });
        }
        res.status(500).json({ error: "ERROR /getAllUsers" });
    }
});

//GET ONE BY ID//
router.get('/getOneUserById/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT ID_USERS, STUDENT_CODE_USERS, EMAIL_USERS, FIRST_NAME_USERS, LAST_NAME_USERS, LAST_NAME_M_USERS, MAJOR_USERS, INTERESTS, CREATED_AT 
            FROM public.USERS 
            WHERE ID_USERS = $1
        `;
        const result = await pool.query(query,[id]);

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

//INSERT//
router.post('/insertUser', async (req, res) => {
    const { student_code, email, password, first_name_users, last_name_users, last_name_m_users, major, id_uni_center, interests } = req.body;
    
    // Validación de campos básicos
    if (!email || !password || !student_code) {
        return res.status(400).json({ error: "Email, password y código son obligatorios" });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt); //CIFRAMOS LA CONTRASEÑA//

        const query = `
            INSERT INTO public.USERS 
            (STUDENT_CODE_USERS, EMAIL_USERS, PASSWORD_USERS, FIRST_NAME_USERS, LAST_NAME_USERS, LAST_NAME_M_USERS, MAJOR_USERS, ID_UNI_CENTERS_USERS, INTERESTS)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *; 
        `;
        
        const values = [
            student_code, 
            email, 
            hashedPassword,
            first_name_users, 
            last_name_users, 
            last_name_m_users,
            major, 
            id_uni_center, 
            JSON.stringify(interests || [])
        ];
        
        const result = await pool.query(query, values);
        res.status(201).json({
            message: "Usuario creado correctamente",
            user: result.rows[0]
        });
        
    } catch (err) {
        console.error(err.message);
        if (err.code === '23505') {
            return res.status(400).json({ error: "El correo o código de estudiante ya existen" });
        }
        res.status(500).json({ error: "ERROR /insertUser" });
    }
});

//UPDATE//
router.put('/updateUser/:id', async (req, res) => {
    const { id } = req.params;
    // 1. Extraemos los nombres de las variables que mandas desde Postman
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

        // 2. EL ORDEN AQUÍ DEBE SER IDÉNTICO AL DE ARRIBA
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

        return res.json({
            message: "User Updated Successfully",
            user: result.rows[0]
        });

    } catch (err) {
        console.error("Error en Update:", err.message);
        return res.status(500).json({ error: "ERROR /updateUser" });
    }
});

//UPDATE EMAIL//
router.put('/updateEmail/:id', async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;

    //VALIDACIÓN DE DOMINIO INSTITUCIONAL//
    if (!email.endsWith('.udg.mx')) {
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

//UPDATE PASSWORD//
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
        // 2. Verificar existencia y contraseña actual
        const userResult = await pool.query('SELECT password_users FROM public.USERS WHERE id_users = $1', [id]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password_users);
        if (!isMatch) return res.status(401).json({ error: "La contraseña actual es incorrecta" });

        // 3. Hashear y Guardar
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