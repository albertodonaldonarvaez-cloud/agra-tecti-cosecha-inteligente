package com.agratec.fieldapp.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Productos del almacén (cache local + altas offline).
 *
 * Misma mecánica que los colaboradores: los del servidor llegan por el pull con
 * [serverId]; los dados de alta en el campo nacen con isSynced = false y se
 * suben usando clientUuid como clave de idempotencia.
 */
@Entity(
    tableName = "products_cache",
    indices = [Index(value = ["clientUuid"], unique = true)]
)
data class ProductEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** UUID local — clave de idempotencia con el servidor */
    val clientUuid: String,

    /** ID en el servidor (null hasta sincronizar) */
    val serverId: Int? = null,

    val name: String,

    val brand: String? = null,

    /**
     * Categoría del catálogo del almacén (fertilizante_liquido, insecticida, …).
     * El defaultValue debe coincidir con el SQL de la migración 4→5: si no,
     * Room considera que la migración falló y recrearía la base local.
     */
    @ColumnInfo(defaultValue = "otro")
    val category: String = "otro",

    /** Unidad de medida asignada: kg, g, lt, ml, ton, oz, lb, gal, … */
    @ColumnInfo(defaultValue = "kg")
    val unit: String = "kg",

    /** Notas del producto (dosis recomendada, observaciones del campo…) */
    val description: String? = null,

    /** Ingrediente activo, tal como viene en la etiqueta */
    val activeIngredient: String? = null,

    /** Concentración de la etiqueta (p. ej. "35 %") */
    val concentration: String? = null,

    /** Presentación (bidón de 20 L, saco de 50 kg…) */
    val presentation: String? = null,

    /** Dónde está guardado en la bodega */
    val storageLocation: String? = null,

    /** Foto del producto ya en el servidor (ruta relativa) */
    val photoUrl: String? = null,

    /** Foto tomada en el campo que todavía no se sube */
    val localPhotoPath: String? = null,

    /** Hay una foto local pendiente de subir */
    @ColumnInfo(defaultValue = "0")
    val photoDirty: Boolean = false,

    /**
     * El producto se editó en el teléfono y el cambio no ha llegado al servidor.
     * Va aparte de isSynced: un producto bajado del servidor está sincronizado
     * pero puede tener una edición pendiente encima.
     */
    @ColumnInfo(defaultValue = "0")
    val isDirty: Boolean = false,

    val isSynced: Boolean = false,

    val syncAttempts: Int = 0,

    val lastSyncError: String? = null,
) {
    /** Nombre para mostrar en los selectores */
    fun displayName(): String = if (brand.isNullOrBlank()) name else "$name ($brand)"
}
