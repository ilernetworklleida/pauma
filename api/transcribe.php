<?php
declare(strict_types=1);

// /api/transcribe.php
// Placeholder. Activar en v0.2 cuando integremos Whisper API o AssemblyAI
// para fallback de transcripcion + diarizacion cuando Web Speech API
// del navegador no rinda bien.
//
// Requerira:
//   - OPENAI_API_KEY o ASSEMBLYAI_API_KEY en .env (NUNCA commitear)
//   - validacion de tamano y mimetype del audio recibido
//   - rate limiting por IP
//   - no almacenar el audio: procesar y descartar

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
http_response_code(501);
echo json_encode([
    'error' => 'not_implemented',
    'message' => 'Maluap v0.1 transcribe en cliente con Web Speech API. Endpoint reservado para v0.2.',
], JSON_UNESCAPED_UNICODE);
