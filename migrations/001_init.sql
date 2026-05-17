-- Pauma · 001_init.sql
-- Esquema inicial para funcionalidades futuras (v0.4+).
-- En v0.3 NO se usa, pero dejo el esquema listo para cuentas, feedback
-- de la comunidad sorda y llamadas asistidas.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Usuarios (futuro - login pasivo via magic link a email)
CREATE TABLE IF NOT EXISTS users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(190) NOT NULL UNIQUE,
    display_name    VARCHAR(80) NULL,
    is_deaf         TINYINT(1) DEFAULT 0,
    locale          VARCHAR(8) DEFAULT 'es-ES',
    consent_at      TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at    TIMESTAMP NULL,
    INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Magic link tokens
CREATE TABLE IF NOT EXISTS login_tokens (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,
    token_hash      CHAR(64) NOT NULL,
    expires_at      TIMESTAMP NOT NULL,
    used_at         TIMESTAMP NULL,
    INDEX (user_id),
    INDEX (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Feedback / sugerencias de la comunidad
CREATE TABLE IF NOT EXISTS feedback (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NULL,
    email_optional  VARCHAR(190) NULL,
    category        VARCHAR(40) NOT NULL DEFAULT 'general',
    rating          TINYINT NULL,
    message         TEXT NOT NULL,
    user_agent      VARCHAR(300) NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at),
    INDEX (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Llamadas asistidas (v0.4) - solo metadata, NUNCA el contenido
CREATE TABLE IF NOT EXISTS assisted_calls (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,
    target_e164     VARCHAR(20) NOT NULL,
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at        TIMESTAMP NULL,
    duration_secs   INT UNSIGNED NULL,
    status          ENUM('initiated','answered','no-answer','failed','completed') NOT NULL DEFAULT 'initiated',
    cost_cents      INT UNSIGNED NULL,
    twilio_sid      VARCHAR(64) NULL,
    INDEX (user_id, started_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cuotas/uso mensual por usuario
CREATE TABLE IF NOT EXISTS usage_monthly (
    user_id         BIGINT UNSIGNED NOT NULL,
    period_ym       CHAR(7) NOT NULL,                  -- "2026-05" (year_month es palabra reservada en MySQL 8)
    transcribe_min  INT UNSIGNED DEFAULT 0,
    tts_chars       INT UNSIGNED DEFAULT 0,
    call_secs       INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (user_id, period_ym),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
