package com.agratec.fieldapp.ui.screens

import android.net.Uri
import android.os.Environment
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.agratec.fieldapp.BuildConfig
import com.agratec.fieldapp.data.local.entity.ProductEntity
import com.agratec.fieldapp.data.repository.ProductRepository
import com.agratec.fieldapp.ui.components.*
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Almacén de productos.
 *
 * Mismo comportamiento que Personal: con internet se baja el catálogo del
 * servidor y sin internet se puede dar de alta o EDITAR un producto, que sube
 * solo al recuperar la señal. Cada producto trae su unidad de medida, que es la
 * que se usa al registrar consumo en una actividad.
 *
 * La foto del producto sí puede salir de la galería (a diferencia de la
 * evidencia de campo, que exige cámara en vivo): aquí lo normal es fotografiar
 * la etiqueta o reusar la foto que mandó el proveedor.
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

    // Producto que se está editando (null con el formulario abierto = alta nueva)
    var editing by remember { mutableStateOf<ProductEntity?>(null) }
    var showEditForm by remember { mutableStateOf(false) }

    // Foto elegida para el formulario abierto (todavía sin guardar)
    var formPhotoPath by rememberSaveable { mutableStateOf<String?>(null) }
    // rememberSaveable: la cámara puede matar el proceso y se perdería la ruta
    var pendingPhotoPath by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { repository.pullFromServer() }

    fun nuevoArchivo(): Pair<Uri, String> {
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        val file = File.createTempFile("AGRA_PROD_${stamp}_", ".jpg", dir)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return uri to file.absolutePath
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        val path = pendingPhotoPath
        if (success && path != null) formPhotoPath = path
        pendingPhotoPath = null
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val (uri, path) = nuevoArchivo()
            pendingPhotoPath = path
            cameraLauncher.launch(uri)
        } else {
            Toast.makeText(context, "Se necesita permiso de cámara", Toast.LENGTH_SHORT).show()
        }
    }

    // El selector de fotos del sistema no pide permisos de almacenamiento
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val copia = withContext(Dispatchers.IO) {
                try {
                    val (_, path) = nuevoArchivo()
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        File(path).outputStream().use { output -> input.copyTo(output) }
                    }
                    path
                } catch (e: Exception) {
                    null
                }
            }
            if (copia != null) formPhotoPath = copia
            else Toast.makeText(context, "No se pudo leer esa imagen", Toast.LENGTH_SHORT).show()
        }
    }

    val filtered = remember(products, search) {
        val q = search.trim().lowercase()
        if (q.isBlank()) products
        else products.filter {
            it.name.lowercase().contains(q) || (it.brand ?: "").lowercase().contains(q)
        }
    }
    val pendingCount = products.count { !it.isSynced || it.isDirty || it.photoDirty }

    val cerrarFormulario = {
        showEditForm = false
        editing = null
        formPhotoPath = null
        onCreateFormClosed()
    }

    if (showCreateForm || showEditForm) {
        ProductDialog(
            product = editing,
            photoPath = formPhotoPath,
            onTakePhoto = { cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA) },
            onPickPhoto = {
                galleryLauncher.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            },
            onRemovePhoto = { formPhotoPath = null },
            onDismiss = cerrarFormulario,
            onSave = { datos ->
                val actual = editing
                scope.launch {
                    val uuid = if (actual == null) {
                        repository.addProduct(
                            name = datos.name,
                            brand = datos.brand,
                            category = datos.category,
                            unit = datos.unit,
                            description = datos.description,
                            activeIngredient = datos.activeIngredient,
                            concentration = datos.concentration,
                            presentation = datos.presentation,
                            storageLocation = datos.storageLocation,
                        ).clientUuid
                    } else {
                        repository.updateProduct(
                            product = actual,
                            name = datos.name,
                            brand = datos.brand,
                            category = datos.category,
                            unit = datos.unit,
                            description = datos.description,
                            activeIngredient = datos.activeIngredient,
                            concentration = datos.concentration,
                            presentation = datos.presentation,
                            storageLocation = datos.storageLocation,
                        )
                        actual.clientUuid
                    }
                    // La foto se guarda después de los datos, leyendo el producto
                    // ya actualizado: si no, la edición se pisaría a sí misma
                    formPhotoPath?.let { repository.setPhoto(uuid, it) }
                    Toast.makeText(
                        context,
                        if (actual == null) "Producto agregado ✅" else "Producto actualizado ✅",
                        Toast.LENGTH_SHORT,
                    ).show()
                    cerrarFormulario()
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
                items(filtered, key = { it.id }) { product ->
                    ProductCard(
                        product = product,
                        onClick = {
                            editing = product
                            formPhotoPath = null
                            showEditForm = true
                        },
                    )
                }
            }
        }
    }
}

/** URL completa de la foto que ya está en el servidor */
private fun urlFoto(photoUrl: String?): String? =
    photoUrl?.takeIf { it.isNotBlank() }?.let {
        if (it.startsWith("http")) it else BuildConfig.BASE_URL.trimEnd('/') + it
    }

@Composable
private fun ProductCard(product: ProductEntity, onClick: () -> Unit) {
    val foto = product.localPhotoPath ?: urlFoto(product.photoUrl)
    GlassCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(AgraEmerald100),
                contentAlignment = Alignment.Center,
            ) {
                if (foto != null) {
                    AsyncImage(
                        model = foto,
                        contentDescription = product.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Text("🧪", fontSize = 20.sp)
                }
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
                AgraSyncDot(product.isSynced && !product.isDirty && !product.photoDirty)
                Spacer(Modifier.height(4.dp))
                Text(
                    when {
                        !product.isSynced -> "Pendiente"
                        product.isDirty || product.photoDirty -> "Editado"
                        else -> "Editar"
                    },
                    color = if (product.isSynced && !product.isDirty && !product.photoDirty) TextTertiary else SyncPending,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/** Lo que el formulario devuelve al guardar */
data class ProductFormData(
    val name: String,
    val brand: String?,
    val category: String,
    val unit: String,
    val description: String?,
    val activeIngredient: String?,
    val concentration: String?,
    val presentation: String?,
    val storageLocation: String?,
)

/**
 * Alta y edición de producto. Arriba lo indispensable en campo (nombre, unidad
 * y tipo); los datos de etiqueta quedan detrás de "Más datos" para no llenar la
 * pantalla a quien solo quiere dar de alta algo rápido.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProductDialog(
    product: ProductEntity?,
    photoPath: String?,
    onTakePhoto: () -> Unit,
    onPickPhoto: () -> Unit,
    onRemovePhoto: () -> Unit,
    onDismiss: () -> Unit,
    onSave: (ProductFormData) -> Unit,
) {
    var name by remember(product) { mutableStateOf(product?.name ?: "") }
    var brand by remember(product) { mutableStateOf(product?.brand ?: "") }
    var category by remember(product) { mutableStateOf(product?.category ?: "otro") }
    var unit by remember(product) { mutableStateOf(product?.unit ?: "kg") }
    var description by remember(product) { mutableStateOf(product?.description ?: "") }
    var activeIngredient by remember(product) { mutableStateOf(product?.activeIngredient ?: "") }
    var concentration by remember(product) { mutableStateOf(product?.concentration ?: "") }
    var presentation by remember(product) { mutableStateOf(product?.presentation ?: "") }
    var storageLocation by remember(product) { mutableStateOf(product?.storageLocation ?: "") }
    var moreFields by remember(product) {
        mutableStateOf(
            !product?.activeIngredient.isNullOrBlank() || !product?.concentration.isNullOrBlank() ||
                !product?.presentation.isNullOrBlank() || !product?.storageLocation.isNullOrBlank() ||
                !product?.description.isNullOrBlank()
        )
    }

    val fotoActual = photoPath ?: product?.localPhotoPath ?: urlFoto(product?.photoUrl)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (product == null) "Nuevo producto" else "Editar producto",
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
            )
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                // ── Foto del producto ──
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(AgraEmerald100)
                            .border(1.dp, CardBorder, RoundedCornerShape(16.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (fotoActual != null) {
                            AsyncImage(
                                model = fotoActual,
                                contentDescription = "Foto del producto",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            Text("📷", fontSize = 26.sp)
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Foto del producto", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "Ayuda a no confundir envases parecidos en la bodega.",
                            color = TextTertiary,
                            fontSize = 11.sp,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            AgraChip(label = "Cámara", selected = false, onClick = onTakePhoto)
                            AgraChip(label = "Galería", selected = false, onClick = onPickPhoto)
                            if (photoPath != null) {
                                AgraChip(label = "Quitar", selected = false, onClick = onRemovePhoto, color = SeverityHigh)
                            }
                        }
                    }
                }

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

                // ── Datos de etiqueta (opcionales) ──
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { moreFields = !moreFields },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (moreFields) "Menos datos" else "Más datos de la etiqueta",
                        color = AgraGreen,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(if (moreFields) "▲" else "▼", color = AgraGreen, fontSize = 11.sp)
                }

                if (moreFields) {
                    AgraTextField(
                        value = activeIngredient,
                        onValueChange = { activeIngredient = it.take(255) },
                        label = "Ingrediente activo",
                    )
                    AgraTextField(
                        value = concentration,
                        onValueChange = { concentration = it.take(128) },
                        label = "Concentración (p. ej. 35 %)",
                    )
                    AgraTextField(
                        value = presentation,
                        onValueChange = { presentation = it.take(128) },
                        label = "Presentación (bidón 20 L, saco 50 kg…)",
                    )
                    AgraTextField(
                        value = storageLocation,
                        onValueChange = { storageLocation = it.take(255) },
                        label = "Dónde está guardado",
                    )
                    AgraTextField(
                        value = description,
                        onValueChange = { description = it.take(1000) },
                        label = "Notas (dosis, precauciones…)",
                        singleLine = false,
                        minLines = 2,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        ProductFormData(
                            name = name,
                            brand = brand.ifBlank { null },
                            category = category,
                            unit = unit,
                            description = description.ifBlank { null },
                            activeIngredient = activeIngredient.ifBlank { null },
                            concentration = concentration.ifBlank { null },
                            presentation = presentation.ifBlank { null },
                            storageLocation = storageLocation.ifBlank { null },
                        )
                    )
                },
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
