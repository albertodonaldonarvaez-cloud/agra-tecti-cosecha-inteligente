package com.agratec.fieldapp.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.R

// ============================================
// Google Fonts — Inter (same as frontend)
// ============================================

private val fontProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

private val interFont = GoogleFont("Inter")

val InterFontFamily = FontFamily(
    Font(googleFont = interFont, fontProvider = fontProvider, weight = FontWeight.Normal),
    Font(googleFont = interFont, fontProvider = fontProvider, weight = FontWeight.Medium),
    Font(googleFont = interFont, fontProvider = fontProvider, weight = FontWeight.SemiBold),
    Font(googleFont = interFont, fontProvider = fontProvider, weight = FontWeight.Bold),
    Font(googleFont = interFont, fontProvider = fontProvider, weight = FontWeight.ExtraBold),
)

// ============================================
// Typography — Modern hierarchy matching frontend
// ============================================

val AgraTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        letterSpacing = (-0.5).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        letterSpacing = (-0.3).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        letterSpacing = 0.5.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        letterSpacing = 0.3.sp,
    ),
)

// ============================================
// Paleta de colores Agra Tec-Ti — Modo Claro
// Inspirada en el logo: verde naturaleza + tech
// ============================================

// Greens (brand)
val AgraGreen = Color(0xFF16A34A)
val AgraGreenLight = Color(0xFF22C55E)
val AgraGreenDark = Color(0xFF15803D)
val AgraGreenSurface = Color(0xFFECFDF5) // Verde muy tenue para fondos

// Emerald (secondary brand)
val AgraEmerald50 = Color(0xFFECFDF5)
val AgraEmerald100 = Color(0xFFD1FAE5)
val AgraEmerald600 = Color(0xFF059669)

// Teal (accent)
val AgraTeal50 = Color(0xFFF0FDFA)

// Background — light
val LightBg1 = Color(0xFFF8FAFC) // Slate 50
val LightBg2 = Color(0xFFF1F5F9) // Slate 100
val LightBg3 = Color(0xFFE2E8F0) // Slate 200
val LightBg4 = Color(0xFFFFFFFF) // White

// Text
val TextPrimary = Color(0xFF0F172A)   // Slate 900
val TextSecondary = Color(0xFF475569)  // Slate 600
val TextTertiary = Color(0xFF94A3B8)   // Slate 400

// Card borders
val CardBorder = Color(0xFFE2E8F0)     // Slate 200
val CardBorderFocused = Color(0xFF16A34A) // Green

// Status colors
val StatusOpen = Color(0xFFF59E0B)     // Amber
val StatusInProgress = Color(0xFF3B82F6) // Blue
val StatusResolved = Color(0xFF22C55E)   // Green
val StatusCritical = Color(0xFFEF4444)   // Red

// Severity
val SeverityLow = Color(0xFF94A3B8)
val SeverityMedium = Color(0xFFF59E0B)
val SeverityHigh = Color(0xFFF97316)
val SeverityCritical = Color(0xFFEF4444)

// Sync status
val SyncPending = Color(0xFFF59E0B)
val SyncOk = Color(0xFF22C55E)
val SyncError = Color(0xFFEF4444)

// Legacy aliases for backward compat
val DarkBg1 = LightBg1
val DarkBg2 = LightBg2
val DarkBg3 = LightBg3

// Glass effect colors (light mode)
val GlassWhite = Color(0xCCFFFFFF)       // 80% white
val GlassWhiteBorder = Color(0x33000000) // Subtle dark border
val GlassDark = Color(0x0A000000)        // Very subtle shadow
val GlassDarkBorder = Color(0x15000000)

// Category accent colors (matching frontend FieldNotes.tsx)
val CatPlaga = Color(0xFFEF4444)       // red-600
val CatRiego = Color(0xFF3B82F6)       // blue-600
val CatDano = Color(0xFFF97316)        // orange-600
val CatMaleza = Color(0xFF84CC16)      // lime-500
val CatFertilizacion = Color(0xFF8B5CF6)  // violet-500
val CatSuelo = Color(0xFF92400E)       // amber-900
val CatInfra = Color(0xFF64748B)       // slate-500
val CatFauna = Color(0xFFF59E0B)       // amber-500
val CatArboles = Color(0xFF16A34A)     // green-600
val CatOtro = Color(0xFF94A3B8)        // slate-400

private val LightColorScheme = lightColorScheme(
    primary = AgraGreen,
    onPrimary = Color.White,
    primaryContainer = AgraGreenSurface,
    onPrimaryContainer = AgraGreenDark,
    secondary = AgraGreenLight,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD1FAE5),
    onSecondaryContainer = AgraGreenDark,
    tertiary = Color(0xFF4ADE80),
    background = LightBg1,
    onBackground = TextPrimary,
    surface = LightBg4,
    onSurface = TextPrimary,
    surfaceVariant = LightBg2,
    onSurfaceVariant = TextSecondary,
    outline = CardBorder,
    outlineVariant = Color(0xFFF1F5F9),
    error = Color(0xFFEF4444),
    onError = Color.White,
)

@Composable
fun AgraFieldTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = AgraTypography,
        content = content
    )
}
