package com.agratec.fieldapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.agratec.fieldapp.data.local.dao.FieldNoteDao
import com.agratec.fieldapp.data.local.dao.PhotoDao
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import com.agratec.fieldapp.data.local.entity.PhotoEntity

/**
 * Base de datos Room local para la app de campo.
 * Almacena notas y fotos mientras el dispositivo está offline.
 *
 * Singleton: usar [getInstance] para obtener la instancia.
 * Destructive migration habilitada para simplificar el desarrollo
 * (en producción se deben usar migraciones manuales).
 */
@Database(
    entities = [FieldNoteEntity::class, PhotoEntity::class],
    version = 1,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun fieldNoteDao(): FieldNoteDao
    abstract fun photoDao(): PhotoDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "agra_field_notes.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
