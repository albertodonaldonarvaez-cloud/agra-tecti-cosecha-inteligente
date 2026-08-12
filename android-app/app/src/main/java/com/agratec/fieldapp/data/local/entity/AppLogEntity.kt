package com.agratec.fieldapp.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Bitácora de lo que pasa en la app: entradas, fotos tomadas, registros
 * creados, sincronizaciones y errores.
 *
 * Se guarda primero en el teléfono (en el campo casi nunca hay señal) y se
 * sube por lotes en la sincronización. [clientLogId] es la clave de
 * idempotencia: si el lote se reintenta, el servidor no duplica el evento.
 *
 * Los eventos ya subidos se borran del teléfono; nunca crece sin control.
 */
@Entity(
    tableName = "app_logs",
    indices = [Index(value = ["clientLogId"], unique = true)]
)
data class AppLogEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** UUID local — clave de idempotencia con el servidor */
    val clientLogId: String,

    /** login, logout, app_open, screen_view, photo_capture, sync, error, … */
    val action: String,

    /** Pantalla o sección donde ocurrió (Notas, Libreta, Almacén, …) */
    val screen: String? = null,

    /** Texto corto y legible de lo que pasó */
    val detail: String? = null,

    /** Bytes antes de comprimir (solo eventos de foto) */
    val originalBytes: Long? = null,

    /** Bytes después de comprimir (solo eventos de foto) */
    val finalBytes: Long? = null,

    /** Duración en segundos, cuando el evento la tiene (una sincronización, p. ej.) */
    val durationSeconds: Int? = null,

    /** Momento real en el teléfono (ISO 8601): la subida puede ser días después */
    val occurredAt: String,

    val isSynced: Boolean = false,

    val syncAttempts: Int = 0,
)
