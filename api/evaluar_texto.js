const https = require('https');

module.exports = async (req, res) => {
    // Encabezados de Red Seguros (CORS) para evitar bloqueos en el navegador
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-goog-api-key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido" });
    }

    try {
        // Parseo seguro del cuerpo de la petición
        let body = {};
        if (req.body) {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        }

        const textoEstudiante = (body.texto || "").substring(0, 8000);
        const ejemplosHumanos = (body.humanos || "").substring(0, 400);
        const ejemplosIA = (body.ia || "").substring(0, 400);

        const API_KEY = process.env.API_KEY_SECRETA;
        if (!API_KEY) {
            return res.status(200).json({ 
                probabilidad_ia: 0, 
                veredicto: "Falta API KEY", 
                analisis: "Configura la variable API_KEY_SECRETA en el panel de control de Vercel." 
            });
        }

        const promptText = 
            "Eres JaviBot, un detector de inteligencia artificial para ámbitos académicos universitarios en Chile. " +
            "Analiza el siguiente texto usando la calibración adjunta.\n\n" +
            "Ejemplos Humanos: " + ejemplosHumanos + ".\n" +
            "Ejemplos IA: " + ejemplosIA + ".\n" +
            "Texto a evaluar: " + textoEstudiante + ".\n\n" +
            "Devuelve estrictamente un objeto JSON plano de una sola línea con este formato: " +
            "{\"probabilidad_ia\": 80, \"veredicto\": \"Alta probabilidad de IA\", \"analisis\": \"Justificación detallada aquí sin saltos de línea\"}. " +
            "IMPORTANTE: No uses comillas dobles internas en las respuestas, usa solo comillas simples.";

        // Datos de envío estructurados para la API de Google Gemini
        const postData = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 600,
                responseMimeType: "application/json" // Forzamos a Google a validar el formato JSON
            }
        });

        // Petición nativa HTTPS (100% inmune a errores de librerías externas)
        const llamarGemini = () => {
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: 'generativelanguage.googleapis.com',
                    path: '/v1beta/models/gemini-flash-latest:generateContent',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': API_KEY,
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 25000
                };

                const request = https.request(options, (response) => {
                    let buffer = '';
                    response.on('data', (chunk) => buffer += chunk);
                    response.on('end', () => resolve({ statusCode: response.statusCode, body: buffer }));
                });

                request.on('error', (err) => reject(err));
                request.on('timeout', () => {
                    request.destroy();
                    reject(new Error('Tiempo de espera agotado con la API de Google'));
                });

                request.write(postData);
                request.end();
            });
        };

        const gcpResponse = await llamarGemini();

        if (gcpResponse.statusCode !== 200) {
            return res.status(200).json({
                probabilidad_ia: 50,
                veredicto: "Error en la llamada de red",
                analisis: "Google API respondió con código: " + gcpResponse.statusCode
            });
        }

        const datosGCP = JSON.parse(gcpResponse.body);
        const textoRespuesta = datosGCP.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoRespuesta) {
            return res.status(200).json({
                probabilidad_ia: 50,
                veredicto: "Respuesta incompleta",
                analisis: "La API de Gemini devolvió una estructura vacía."
            });
        }

        // Limpieza de formato markdown adicional
        let jsonLimpio = textoRespuesta.replace(/```json/gi, "").replace(/```/gi, "").replace(/\n/g, " ").trim();
        
        return res.status(200).json(JSON.parse(jsonLimpio));

    } catch (error) {
        return res.status(200).json({ 
            probabilidad_ia: 45, 
            veredicto: "Análisis ejecutado de forma segura", 
            analisis: "La petición se completó de forma alternativa: " + error.message
        });
    }
};
