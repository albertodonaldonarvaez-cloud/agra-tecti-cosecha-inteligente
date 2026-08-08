package com.agratec.fieldapp.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Entidad Room para notas de campo almacenadas localmente.
 * El campo [folio] es un UUID generado en el dispositivo que sirve como
 * clave de idempotencia al sincronizar con el servidor.
 *
 * [isSynced] indica si la nota ya fue enviada exitosamente al backend.
 * El SyncWorker lee las notas con isSynced = false y las envía en batch.
 *
 * Las notas también se BAJAN del servidor (las capturadas en la web o por
 * Telegram), para poder darles seguimiento y cerrarlas desde el campo.
 */
@Entity(
    tableName = "field_notes",
    indices = [Index(value = ["folio"], unique = true)]
)
data class FieldNoteEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** UUID v4 generado localmente — clave de idempotencia con el servidor */
    val folio: String,

    /** Descripción de la observación */
    val description: String,

    /** Categoría: arboles_mal_plantados, plaga_enfermedad, riego_drenaje, etc. */
    val category: String,

    /** Severidad: baja, media, alta, critica */
    val severity: String = "media",

    /** ID de parcela (puede ser null si no se seleccionó) */
    val parcelId: Int? = null,

    /** Coordenadas GPS capturadas al momento de crear la nota */
    val latitude: Double? = null,
    val longitude: Double? = null,

    /** Timestamp local (ISO 8601) de cuando se creó la nota */
    val createdAtLocal: String,

    /** ID en el servidor (null si la nota nació en el teléfono y aún no sube) */
    val serverId: Int? = null,

    /** Estado de seguimiento: abierta, en_revision, en_progreso, resuelta, descartada */
    @ColumnInfo(defaultValue = "abierta")
    val status: String = "abierta",

    /** Qué se hizo para resolverla (se captura al cerrarla) */
    val resolutionNotes: String? = null,

    /**
     * Hay un cambio de estado hecho en el campo pendiente de subir.
     * Se maneja aparte de [isSynced] para no reenviar la nota completa: al
     * cerrar una nota solo viaja su nuevo estado.
     */
    @ColumnInfo(defaultValue = "0")
    val statusDirty: Boolean = false,

    /** Flag de sincronización: false = pendiente, true = enviado OK */
    val isSynced: Boolean = false,

    /** Número de intentos fallidos de sincronización */
    val syncAttempts: Int = 0,

    /** Último error de sincronización (para debugging) */
    val lastSyncError: String? = null,
)
