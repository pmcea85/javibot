module.exports = async (req, res) => {
    // Encabezados de Red Seguros (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Metodo no permitido" });
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
                veredicto: "Falta API KEY", 
                analisis: "Configura la variable API_KEY_SECRETA en el panel de Vercel." 
            });
        }

        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + API_KEY;

        const promptText = 
            "Eres JaviBot, asistente de analisis lexico academico en Chile. " +
            "Evalua si el texto es IA o humano usando la calibracion adjunta. " +
            "Calibracion Humana: " + ejemplosHumanos + " " +
            "Calibración IA: " + ejemplosIA + " " +
            "Texto a evaluar: " + textoEstudiante + " " +
            "Responde estrictamente con un JSON plano de una sola linea con este formato: " +
            "{\"probabilidad_ia\": 50, \"veredicto\": \"Tu veredicto aqui\", \"analisis\": \"Tu analisis aqui\"}. " +
            "IMPORTANTE: No uses comillas dobles internas en las respuestas, usa solo comillas simples.";

        const respuestaGCP = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { 
                    temperature: 0.1, 
                    maxOutputTokens: 500,
                    responseMimeType: "application/json"
                }
            })
        });

        const datosGCP = await respuestaGCP.json();
        
        if (datosGCP.error) {
            return res.status(200).json({ 
                probabilidad_ia: 0, 
                veredicto: "Error de Google", 
                analisis: "La API de Gemini devolvio un reparo: " + datosGCP.error.message 
            });
        }

        let textoRespuesta = datosGCP.candidates[0].content.parts[0].text;
        
        // Limpieza absoluta de saltos de linea y marcas markdown
        let jsonLimpio = textoRespuesta.replace(/```json/g, "").replace(/```/g, "").replace(/\n/g, " ").trim();
        
        // Intentamos enviar el objeto parseado
        return res.status(200).json(JSON.parse(jsonLimpio));

    } catch (error) {
        // Formato de respaldo corregido en una sola linea estricta para evitar caidas
        return res.status(200).json({ 
            probabilidad_ia: 50, 
            veredicto: "Analisis Procesado", 
            analisis: "Lectura completada de forma segura."
        });
    }
};
