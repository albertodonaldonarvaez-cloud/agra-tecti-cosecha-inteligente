package com.agratec.fieldapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ============================================
// Paleta de colores Agra Tec-Ti
// Inspirada en el logo: verde naturaleza + verde tech
// ============================================

// Greens (brand)
val AgraGreen = Color(0xFF16A34A)
val AgraGreenLight = Color(0xFF22C55E)
val AgraGreenDark = Color(0xFF15803D)
val AgraGreenSurface = Color(0xFF052E16)

// Glass effect colors
val GlassWhite = Color(0x33FFFFFF)       // 20% white
val GlassWhiteBorder = Color(0x55FFFFFF) // 33% white
val GlassDark = Color(0x44000000)        // 27% black
val GlassDarkBorder = Color(0x33FFFFFF)  // 20% white border on dark

// Background gradients
val DarkBg1 = Color(0xFF0A0F1A)  // Deep navy
val DarkBg2 = Color(0xFF0F172A)  // Slate 900
val DarkBg3 = Color(0xFF1E293B)  // Slate 800

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

private val DarkColorScheme = darkColorScheme(
    primary = AgraGreen,
    onPrimary = Color.White,
    primaryContainer = AgraGreenDark,
    onPrimaryContainer = Color.White,
    secondary = AgraGreenLight,
    onSecondary = Color.Black,
    secondaryContainer = Color(0xFF1A3A2A),
    onSecondaryContainer = AgraGreenLight,
    tertiary = Color(0xFF4ADE80),
    background = DarkBg1,
    onBackground = Color(0xFFF1F5F9),
    surface = DarkBg2,
    onSurface = Color(0xFFE2E8F0),
    surfaceVariant = DarkBg3,
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF334155),
    outlineVariant = Color(0xFF1E293B),
    error = Color(0xFFEF4444),
    onError = Color.White,
)

@Composable
fun AgraFieldTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
