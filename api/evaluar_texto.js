export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const { texto, humanos, ia } = JSON.parse(req.body);
        
        // Recorte de seguridad para velocidad
        const textoEstudiante = (texto || "").substring(0, 10000);
        const API_KEY = process.env.API_KEY_SECRETA;

        if (!API_KEY) {
            return res.status(500).json({ error: 'Falta API_KEY_SECRETA' });
        }

        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + API_KEY;

        const promptText = 
            "Analiza si este texto es IA o Humano. Contexto: Chile.\n" +
            "Calibración Humana: " + (humanos || "").substring(0, 500) + "\n" +
            "Calibración IA: " + (ia || "").substring(0, 500) + "\n\n" +
            "Texto a evaluar: " + textoEstudiante + "\n\n" +
            "Responde SOLO un JSON con: probabilidad_ia (número), veredicto (texto), analisis (texto).";

        const respuesta = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
            })
        });

        const datosGCP = await respuesta.json();
        
        if (datosGCP.error) {
            return res.status(500).json({ error: datosGCP.error.message });
        }

        let textoRespuesta = datosGCP.candidates[0].content.parts[0].text;
        let jsonLimpio = textoRespuesta.split("```json").join("").split("
```").join("").trim();

        // Enviamos la respuesta como JSON real
        res.status(200).json(JSON.parse(jsonLimpio));

    } catch (error) {
        res.status(500).json({ error: "Fallo en la API: " + error.message });
    }
}
