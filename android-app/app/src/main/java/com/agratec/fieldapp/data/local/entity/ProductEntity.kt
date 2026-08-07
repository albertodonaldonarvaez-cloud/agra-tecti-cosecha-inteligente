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

    val isSynced: Boolean = false,

    val syncAttempts: Int = 0,

    val lastSyncError: String? = null,
) {
    /** Nombre para mostrar en los selectores */
    fun displayName(): String = if (brand.isNullOrBlank()) name else "$name ($brand)"
}
