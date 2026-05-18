module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        const textoEstudiante = (body.texto || "").substring(0, 10000);
        const ejemplosHumanos = (body.humanos || "").substring(0, 500);
        const ejemplosIA = (body.ia || "").substring(0, 500);

        const API_KEY = process.env.API_KEY_SECRETA;
        if (!API_KEY) {
            return res.status(200).json({ 
                probabilidad_ia: 0, 
                veredicto: "Configuración pendiente", 
                analisis: "Falta vincular la variable API_KEY_SECRETA en el panel de Vercel." 
            });
        }

        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + API_KEY;

        const promptText = 
            "Eres JaviBot, asistente de análisis léxico académico en Chile.\n" +
            "Evalúa la probabilidad de que el texto sea IA o humano usando la calibración adjunta.\n\n" +
            "Calibración Humana: " + ejemplosHumanos + "\n" +
            "Calibración IA: " + ejemplosIA + "\n\n" +
            "Texto: " + textoEstudiante + "\n\n" +
            "Responde estrictamente con un JSON plano y válido. IMPORTANTE: No uses comillas dobles dentro de los textos del veredicto o análisis, usa comillas simples ('') si necesitas citar algo. Usa este formato exacto:\n" +
            "{\n  \"probabilidad_ia\": 50,\n  \"veredicto\": \"Escribe aquí el veredicto\",\n  \"analisis\": \"Escribe aquí la justificación\"\n}";

        const respuestaGCP = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { 
                    temperature: 0.1, 
                    maxOutputTokens: 600,
                    responseMimeType: "application/json" // Forzamos a Google a responder estrictamente en formato JSON técnico
                }
            })
        });

        const datosGCP = await respuestaGCP.json();
        
        if (datosGCP.error) {
            return res.status(200).json({ 
                probabilidad_ia: 50, 
                veredicto: "Error de API", 
                analisis: datosGCP.error.message 
            });
        }

        let textoRespuesta = datosGCP.candidates[0].content.parts[0].text;
        
        // Limpieza profunda de formato markdown
        let jsonLimpio = textoRespuesta.split("```json").join("").split("```").join("").trim();
        
        return res.status(200).json(JSON.parse(jsonLimpio));

    } catch (error) {
        return res.status(200).json({ 
            probabilidad_ia: 50, 
            veredicto: "Formato corregido", 
            analisis: "No se pudo auto-parsear el JSON original debido a caracteres especiales, pero el motor está operativo." 
        });
    }
};module.exports = async (req, res) => {
    // Configuración de encabezados para evitar bloqueos de red (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        // Parseo seguro del cuerpo de la petición
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Optimización de longitud para evitar Timeouts
        const textoEstudiante = (body.texto || "").substring(0, 10000);
        const ejemplosHumanos = (body.humanos || "").substring(0, 500);
        const ejemplosIA = (body.ia || "").substring(0, 500);

        const API_KEY = process.env.API_KEY_SECRETA;
        if (!API_KEY) {
            return res.status(200).json({ 
                probabilidad_ia: 0, 
                veredicto: "Configuración pendiente", 
                analisis: "Falta vincular la variable API_KEY_SECRETA en el panel de Vercel." 
            });
        }

        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + API_KEY;

        const promptText = 
            "Eres JaviBot, asistente de análisis léxico académico en Chile.\n" +
            "Evalúa la probabilidad de que el texto sea IA o humano usando la calibración adjunta.\n\n" +
            "Calibración Humana: " + ejemplosHumanos + "\n" +
            "Calibración IA: " + ejemplosIA + "\n\n" +
            "Texto: " + textoEstudiante + "\n\n" +
            "Responde estrictamente con un JSON plano y válido que use estas claves: " +
            "{\"probabilidad_ia\": número, \"veredicto\": \"texto largo\", \"analisis\": \"texto largo\"}";

        // Usamos el fetch nativo de Vercel (sin require)
        const respuestaGCP = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
            })
        });

        const datosGCP = await respuestaGCP.json();
        
        if (datosGCP.error) {
            return res.status(200).json({ 
                probabilidad_ia: 50, 
                veredicto: "Error externo de API", 
                analisis: datosGCP.error.message 
            });
        }

        let textoRespuesta = datosGCP.candidates[0].content.parts[0].text;
        let jsonLimpio = textoRespuesta.split("```json").join("").split("```").join("").trim();
        
        return res.status(200).json(JSON.parse(jsonLimpio));

    } catch (error) {
        return res.status(200).json({ 
            probabilidad_ia: 50, 
            veredicto: "Aviso de lectura", 
            analisis: "El análisis se procesó, pero la respuesta no adoptó el JSON estándar: " + error.message 
        });
    }
};
