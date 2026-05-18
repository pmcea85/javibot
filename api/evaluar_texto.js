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

        // Prompt rediseñado para exigir rangos, nivel de alerta y evidencia explícita
        const promptText = 
            "Eres JaviBot, un detector de inteligencia artificial especializado en ámbitos académicos chilenos.\n" +
            "Analiza el siguiente texto basándote en la calibración y estima un RANGO DE PROBABILIDAD DE USO DE IA (un mínimo y un máximo).\n\n" +
            "Ejemplos Humanos del docente: " + ejemplosHumanos + ".\n" +
            "Ejemplos IA: " + ejemplosIA + ".\n" +
            "Texto a evaluar: " + textoEstudiante + ".\n\n" +
            "Tu análisis debe encontrar EVIDENCIA explícita: cita frases exactas del texto, conectores, redundancias o falta de emoción que te hagan sospechar de IA, o por el contrario, modismos, errores o fluidez natural que te indiquen que es humano.\n\n" +
            "Clasifica el 'nivel_sospecha' estrictamente como: 'Bajo', 'Moderado' o 'Alto'.";

        // Forzamos a Google a devolver un esquema de datos irrompible
        const postData = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 800,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        rango_minimo: { 
                            type: "integer",
                            description: "Porcentaje mínimo estimado de probabilidad de IA (0 a 100)."
                        },
                        rango_maximo: { 
                            type: "integer",
                            description: "Porcentaje máximo estimado de probabilidad de IA (0 a 100)."
                        },
                        nivel_sospecha: { 
                            type: "string",
                            description: "Nivel de alerta. Solo puede ser: 'Bajo', 'Moderado' o 'Alto'."
                        },
                        evidencia: { 
                            type: "string",
                            description: "Justificación detallada. DEBES citar fragmentos exactos del texto analizado y explicar por qué parecen escritos por un humano o por una Inteligencia Artificial."
                        }
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

        // Limpieza de formato markdown de la respuesta nativa de Google
        const jsonLimpio = textoRespuesta.replace(/```json/gi, "").replace(/```/gi, "").trim();
        const datosFinales = JSON.parse(jsonLimpio);

        return res.status(200).json(datosFinales);

    } catch (error) {
        return res.status(200).json({ 
            error: "Hubo un error al procesar el análisis de la IA: " + error.message 
        });
    }
};
