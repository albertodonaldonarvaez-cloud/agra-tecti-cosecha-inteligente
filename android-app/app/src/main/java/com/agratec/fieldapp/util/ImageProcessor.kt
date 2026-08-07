package com.agratec.fieldapp.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.util.Log
import java.io.File
import java.io.FileOutputStream

/**
 * Procesa las fotos EN EL TELÉFONO antes de guardarlas:
 * - Máximo 8 megapíxeles (las cámaras de 48/64MP generan archivos enormes)
 * - Calidad JPEG media (80): buen detalle con una fracción del peso
 * - Respeta la orientación EXIF (si no, las fotos salen giradas)
 *
 * Así se sube mucho menos por la red del campo y se ocupa menos espacio local.
 */
object ImageProcessor {

    private const val TAG = "ImageProcessor"

    /** 8 MP */
    private const val MAX_PIXELS = 8_000_000L

    /** Calidad media: equilibrio entre nitidez y peso */
    private const val JPEG_QUALITY = 80

    /**
     * Reescala y recomprime la foto sobre el mismo archivo.
     * Si algo falla, deja la foto original intacta (nunca se pierde la evidencia).
     *
     * @return true si se procesó, false si se dejó como estaba
     */
    fun compressInPlace(path: String): Boolean {
        val file = File(path)
        if (!file.exists() || file.length() == 0L) return false
        val originalSize = file.length()

        return try {
            // 1. Leer solo dimensiones (sin cargar la imagen en memoria)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            val srcW = bounds.outWidth
            val srcH = bounds.outHeight
            if (srcW <= 0 || srcH <= 0) return false

            // 2. Factor de reducción por potencias de 2 (lo que soporta el decoder)
            var sampleSize = 1
            while ((srcW.toLong() / sampleSize) * (srcH.toLong() / sampleSize) > MAX_PIXELS) {
                sampleSize *= 2
            }

            val opts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            var bitmap = BitmapFactory.decodeFile(path, opts) ?: return false

            // 3. Ajuste fino: si aún supera 8MP, escalar exacto
            val pixels = bitmap.width.toLong() * bitmap.height.toLong()
            if (pixels > MAX_PIXELS) {
                val scale = Math.sqrt(MAX_PIXELS.toDouble() / pixels.toDouble())
                val newW = (bitmap.width * scale).toInt().coerceAtLeast(1)
                val newH = (bitmap.height * scale).toInt().coerceAtLeast(1)
                val scaled = Bitmap.createScaledBitmap(bitmap, newW, newH, true)
                if (scaled != bitmap) bitmap.recycle()
                bitmap = scaled
            }

            // 4. Conservar la orientación de la cámara
            val rotation = readExifRotation(path)
            if (rotation != 0f) {
                val matrix = Matrix().apply { postRotate(rotation) }
                val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                if (rotated != bitmap) bitmap.recycle()
                bitmap = rotated
            }

            // 5. Guardar con calidad media
            FileOutputStream(file).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            }
            bitmap.recycle()

            val newSize = file.length()
            Log.i(
                TAG,
                "Foto procesada: ${srcW}x${srcH} -> ${originalSize / 1024}KB a ${newSize / 1024}KB " +
                    "(${if (originalSize > 0) (100 - newSize * 100 / originalSize) else 0}% menos)"
            )
            true
        } catch (e: OutOfMemoryError) {
            Log.w(TAG, "Sin memoria para procesar la foto, se deja original", e)
            false
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo procesar la foto, se deja original", e)
            false
        }
    }

    private fun readExifRotation(path: String): Float = try {
        when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    } catch (e: Exception) {
        0f
    }
}
