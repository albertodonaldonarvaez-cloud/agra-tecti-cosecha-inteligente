package com.agratec.fieldapp.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Entidad Room para fotos asociadas a notas de campo.
 * [localPhotoId] es un UUID generado localmente que sirve como clave de
 * idempotencia al subir al servidor via POST /api/sync/photo.
 *
 * [localFilePath] es la ruta absoluta del archivo en el almacenamiento del dispositivo.
 * Cuando [isSynced] es true, la foto ya fue subida exitosamente.
 */
@Entity(
    tableName = "photos",
    indices = [
        Index(value = ["localPhotoId"], unique = true),
        Index(value = ["fieldNoteFolio"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = FieldNoteEntity::class,
            parentColumns = ["folio"],
            childColumns = ["fieldNoteFolio"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class PhotoEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** UUID v4 generado localmente — clave de idempotencia */
    val localPhotoId: String,

    /** Folio (UUID) de la nota de campo asociada */
    val fieldNoteFolio: String,

    /** Ruta absoluta del archivo de imagen en almacenamiento local */
    val localFilePath: String,

    /** Caption descriptivo (opcional) */
    val caption: String? = null,

    /** Flag de sincronización */
    val isSynced: Boolean = false,

    /** Número de intentos fallidos */
    val syncAttempts: Int = 0,

    /** Último error de sincronización */
    val lastSyncError: String? = null,

    /** Timestamp de creación local (ISO 8601) */
    val createdAtLocal: String,
)
