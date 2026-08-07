package com.agratec.fieldapp.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.data.local.entity.ProductEntity
import com.agratec.fieldapp.data.repository.ProductRepository
import com.agratec.fieldapp.ui.components.*
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch

/**
 * Almacén de productos.
 *
 * Mismo comportamiento que Personal: con internet se baja el catálogo del
 * servidor y sin internet se puede dar de alta un producto, que sube solo
 * al recuperar la señal. Cada producto trae su unidad de medida, que es la
 * que se usa al registrar consumo en una actividad.
 */
@Composable
fun WarehouseScreen(
    onSync: () -> Unit,
    showCreateForm: Boolean,
    onCreateFormClosed: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { ProductRepository(context) }
    val products by repository.getAll().collectAsState(initial = emptyList())

    var search by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { repository.pullFromServer() }

    val filtered = remember(products, search) {
        val q = search.trim().lowercase()
        if (q.isBlank()) products
        else products.filter {
            it.name.lowercase().contains(q) || (it.brand ?: "").lowercase().contains(q)
        }
    }
    val pendingCount = products.count { !it.isSynced }

    if (showCreateForm) {
        ProductDialog(
            onDismiss = onCreateFormClosed,
            onSave = { name, brand, category, unit ->
                scope.launch {
                    repository.addProduct(name, brand, category, unit)
                    Toast.makeText(context, "Producto agregado ✅", Toast.LENGTH_SHORT).show()
                    onCreateFormClosed()
                }
            },
        )
    }

    Column(Modifier.fillMaxSize()) {
        AgraHeader(
            title = "Almacén",
            subtitle = "${products.size} producto${if (products.size == 1) "" else "s"} en el catálogo",
            emoji = "📦",
            badge = if (pendingCount > 0) "$pendingCount sin subir" else null,
            actions = { AgraSyncAction(unsyncedCount = pendingCount, onClick = onSync) },
        )

        if (products.size > 6) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Buscar producto o marca", color = TextTertiary, fontSize = 13.sp) },
                singleLine = true,
                shape = RoundedCornerShape(50),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AgraGreen,
                    unfocusedBorderColor = CardBorder,
                    focusedContainerColor = Color.White.copy(alpha = 0.7f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.6f),
                ),
            )
        }

        if (filtered.isEmpty()) {
            AgraEmptyState(
                emoji = "📦",
                title = if (products.isEmpty()) "El almacén está vacío" else "Ningún producto coincide",
                message = if (products.isEmpty())
                    "Da de alta los productos que usas en campo con su unidad de medida; al registrar una actividad podrás anotar cuánto planeas usar y cuánto usaste."
                else "Prueba con otro nombre o marca.",
                modifier = Modifier.weight(1f),
            )
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 160.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { product -> ProductCard(product) }
            }
        }
    }
}

@Composable
private fun ProductCard(product: ProductEntity) {
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(AgraEmerald100),
                contentAlignment = Alignment.Center,
            ) {
                Text("🧪", fontSize = 20.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    product.name,
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!product.brand.isNullOrBlank()) {
                    Text(product.brand, color = TextTertiary, fontSize = 12.sp, maxLines = 1)
                }
                Spacer(Modifier.height(5.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatusBadge(
                        text = ProductRepository.categoryLabel(product.category),
                        color = AgraEmerald600,
                    )
                    StatusBadge(
                        text = ProductRepository.unitLabel(product.unit),
                        color = StatusInProgress,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                AgraSyncDot(product.isSynced)
                if (!product.isSynced) {
                    Spacer(Modifier.height(4.dp))
                    Text("Pendiente", color = SyncPending, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

/** Alta de producto: lo mínimo que se necesita en campo (nombre, tipo y unidad) */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProductDialog(
    onDismiss: () -> Unit,
    onSave: (name: String, brand: String?, category: String, unit: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var brand by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("otro") }
    var unit by remember { mutableStateOf("kg") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nuevo producto", color = TextPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                AgraTextField(
                    value = name,
                    onValueChange = { name = it.take(255) },
                    label = "Nombre del producto *",
                )
                AgraTextField(
                    value = brand,
                    onValueChange = { brand = it.take(255) },
                    label = "Marca (opcional)",
                )

                Text("Unidad de medida", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Es la que se cargará sola al usar el producto en una actividad.",
                    color = TextTertiary,
                    fontSize = 11.sp,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ProductRepository.UNITS.forEach { (value, label) ->
                        AgraChip(
                            label = label,
                            selected = unit == value,
                            onClick = { unit = value },
                        )
                    }
                }

                Text("Tipo de producto", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ProductRepository.CATEGORIES.forEach { (value, label) ->
                        AgraChip(
                            label = label,
                            selected = category == value,
                            onClick = { category = value },
                            color = AgraEmerald600,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name, brand.ifBlank { null }, category, unit) },
                enabled = name.isNotBlank(),
            ) {
                Text("Guardar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", color = TextTertiary) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}
