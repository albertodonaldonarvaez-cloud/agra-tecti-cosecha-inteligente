package com.agratec.fieldapp.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Entidad Room para parcelas cacheadas offline.
 * Se sincronizan desde el servidor cuando hay internet disponible.
 * La app usa este cache local para mostrar el selector de parcelas
 * sin necesidad de conexión.
 */
@Entity(
    tableName = "parcels",
    indices = [Index(value = ["serverId"], unique = true)]
)
data class ParcelEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** ID del servidor (parcels.id en MySQL) */
    val serverId: Int,

    /** Código de la parcela (ej: "07-006355") */
    val code: String,

    /** Nombre descriptivo de la parcela */
    val name: String,
)
