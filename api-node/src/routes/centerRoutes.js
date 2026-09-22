const express = require('express');
const router = express.Router();
const pool = require('../db'); 

// ROUTE: /api/centers //

router.get('/getAllCenters', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM public.UNI_CENTERS ORDER BY NAME_UNI_CENTERS DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Error al obtener los centros" });
    }
});
module.exports = router;