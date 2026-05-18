const https = require('https');

module.exports = async (req, res) => {
    // Configuración de cabeceras para permitir peticiones (CORS)
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
        let body = {};
        if (req.body) {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        }

        const textoEstudiante = (body.texto || "").substring(0, 8000);
        const ejemplosHumanos = (body.humanos || "").substring(0, 400);
        const ejemplosIA = (body.ia || "").substring(0, 400);
        const API_KEY = process.env.API_KEY_SECRETA;

        if (!API_KEY) {
            return res.status(200).json({ error: "Falta API KEY secreta en Vercel." });
        }

        // Prompt reforzado con prohibición de caracteres que rompen el JSON
        const promptText = 
            "Eres JaviBot, un detector de inteligencia artificial especializado en ámbitos académicos chilenos.\n" +
            "Analiza el siguiente texto basándote en la calibración y estima un RANGO DE PROBABILIDAD DE USO DE IA (un mínimo y un máximo).\n\n" +
            "Ejemplos Humanos del docente: " + ejemplosHumanos + ".\n" +
            "Ejemplos IA: " + ejemplosIA + ".\n" +
            "Texto a evaluar: " + textoEstudiante + ".\n\n" +
            "Tu análisis debe encontrar EVIDENCIA explícita: cita frases exactas del texto que te hagan sospechar de IA, o modismos y errores que indiquen que es humano.\n\n" +
            "REGLAS CRÍTICAS DE FORMATO (¡OBLIGATORIAS!):\n" +
            "1. Clasifica el 'nivel_sospecha' estrictamente como: 'Bajo', 'Moderado' o 'Alto'.\n" +
            "2. NO uses comillas dobles (\") dentro de la evidencia. Usa solo comillas simples (').\n" +
            "3. NO uses saltos de línea (Enters) dentro de tus textos. Escribe todo en un solo párrafo continuo.";

        // Forzamos a Google a devolver un esquema de datos
        const postData = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 800,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        rango_minimo: { type: "integer" },
                        rango_maximo: { type: "integer" },
                        nivel_sospecha: { type: "string" },
                        evidencia: { type: "string" }
                    },
                    required: ["rango_minimo", "rango_maximo", "nivel_sospecha", "evidencia"]
                }
            }
        });

        // Conexión HTTPS segura
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

                request.on('error', reject);
                request.on('timeout', () => { request.destroy(); reject(new Error('Tiempo de espera agotado')); });
                request.write(postData);
                request.end();
            });
        };

        const gcpResponse = await llamarGemini();

        if (gcpResponse.statusCode !== 200) {
            return res.status(200).json({ error: "Error de red (" + gcpResponse.statusCode + "): " + gcpResponse.body });
        }

        const datosGCP = JSON.parse(gcpResponse.body);
        const textoRespuesta = datosGCP.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoRespuesta) {
            return res.status(200).json({ error: "La API devolvió una respuesta en blanco." });
        }

        const jsonLimpio = textoRespuesta.replace(/```json/gi, "").replace(/```/gi, "").trim();
        let datosFinales;

        try {
            // Intento principal: Leer el JSON normalmente
            datosFinales = JSON.parse(jsonLimpio);
        } catch (eParseo) {
            // SALVAVIDAS: Si la IA rompió el JSON con comillas o saltos de línea, extraemos los datos a la fuerza
            const matchMin = jsonLimpio.match(/"rango_minimo"\s*:\s*(\d+)/i);
            const matchMax = jsonLimpio.match(/"rango_maximo"\s*:\s*(\d+)/i);
            const matchNiv = jsonLimpio.match(/"nivel_sospecha"\s*:\s*["']([^"']+)["']/i);
            
            // Extraer la evidencia ignorando errores de formato internos
            const matchEvi = jsonLimpio.match(/"evidencia"\s*:\s*["']([\s\S]*?)["']?\s*}/i);

            datosFinales = {
                rango_minimo: matchMin ? parseInt(matchMin[1]) : 10,
                rango_maximo: matchMax ? parseInt(matchMax[1]) : 90,
                nivel_sospecha: matchNiv ? matchNiv[1] : "Moderado",
                evidencia: matchEvi 
                    ? matchEvi[1].replace(/\\"/g, "'").replace(/"/g, "'").replace(/\n/g, " ") 
                    : "El texto fue analizado exitosamente, pero la justificación requirió recuperación de datos por un error de formato de la Inteligencia Artificial."
            };
        }

        return res.status(200).json(datosFinales);

    } catch (error) {
        return res.status(200).json({ 
            error: "Hubo un error de ejecución en el servidor: " + error.message 
        });
    }
};
