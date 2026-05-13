package com.agratec.fieldapp.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.agratec.fieldapp.ui.theme.*

/**
 * Light Glass Card — Componente con efecto sutil de elevación.
 * Para modo claro usa sombras suaves y fondo blanco translúcido.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 20.dp,
    glowColor: Color = AgraGreen,
    showGlow: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(cornerRadius)

    Column(
        modifier = modifier
            .shadow(
                elevation = 2.dp,
                shape = shape,
                ambientColor = Color.Black.copy(alpha = 0.06f),
                spotColor = Color.Black.copy(alpha = 0.04f),
            )
            .clip(shape)
            .background(Color.White)
            .border(
                width = 1.dp,
                color = CardBorder.copy(alpha = 0.6f),
                shape = shape,
            )
            .padding(16.dp),
        content = content,
    )
}

/**
 * Glass Surface — Variante más sutil para backgrounds grandes
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(cornerRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(LightBg2)
            .border(
                width = 0.5.dp,
                color = CardBorder.copy(alpha = 0.4f),
                shape = shape,
            )
            .padding(12.dp),
        content = content,
    )
}
