<?php
declare(strict_types=1);

namespace Pauma;

final class Deepgram
{
    public function __construct(
        private string $managementKey,
        private string $projectId,
    ) {}

    /**
     * Crea una API key temporal con scopes minimos y expiracion corta.
     * El cliente la usa para abrir el WebSocket; al expirar deja de servir.
     * La management key NUNCA sale del servidor.
     *
     * @return array{key: string, key_id: string, expires_at: int}
     * @throws \RuntimeException
     */
    public function createTempKey(int $ttlSeconds = 300): array
    {
        $expiresAt = time() + $ttlSeconds;

        $url = 'https://api.deepgram.com/v1/projects/' . urlencode($this->projectId) . '/keys';
        $payload = json_encode([
            'comment' => 'pauma-temp-' . substr(bin2hex(random_bytes(4)), 0, 6),
            'scopes' => ['member', 'usage:write'],
            'time_to_live_in_seconds' => $ttlSeconds,
        ], JSON_THROW_ON_ERROR);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Authorization: Token ' . $this->managementKey,
                'Content-Type: application/json',
            ],
            CURLOPT_TIMEOUT => 8,
        ]);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($res === false || $code >= 400) {
            throw new \RuntimeException('deepgram_temp_key_failed: ' . $code . ' ' . $err);
        }

        $data = json_decode((string) $res, true);
        if (!is_array($data) || empty($data['key'])) {
            throw new \RuntimeException('deepgram_temp_key_invalid_response');
        }

        return [
            'key' => (string) $data['key'],
            'key_id' => (string) ($data['api_key_id'] ?? ''),
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * Revoca explicitamente una temp key (cuando la sesion se cierra limpiamente).
     */
    public function revokeKey(string $keyId): bool
    {
        $url = 'https://api.deepgram.com/v1/projects/' . urlencode($this->projectId)
             . '/keys/' . urlencode($keyId);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_HTTPHEADER => [
                'Authorization: Token ' . $this->managementKey,
            ],
            CURLOPT_TIMEOUT => 5,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $code < 400;
    }
}
