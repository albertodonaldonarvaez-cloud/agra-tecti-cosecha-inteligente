package com.agratec.fieldapp.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ============================================
// Paleta de colores Agra Tec-Ti — Modo Claro
// Inspirada en el logo: verde naturaleza + tech
// ============================================

// Greens (brand)
val AgraGreen = Color(0xFF16A34A)
val AgraGreenLight = Color(0xFF22C55E)
val AgraGreenDark = Color(0xFF15803D)
val AgraGreenSurface = Color(0xFFECFDF5) // Verde muy tenue para fondos

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
        content = content
    )
}
