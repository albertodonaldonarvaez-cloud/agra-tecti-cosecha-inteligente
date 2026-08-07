package com.agratec.fieldapp.data.prefs

import android.content.Context

/**
 * Catálogo de puestos del personal, guardado en el teléfono.
 *
 * Se refresca con el catálogo del servidor cada vez que hay red, y cuando
 * alguien captura un puesto con la opción "Otro" se agrega de inmediato aquí
 * (para que aparezca en el selector aunque no haya señal). Ese mismo puesto
 * viaja con el colaborador y queda dado de alta en el servidor al sincronizar.
 */
object CatalogPreferences {

    private const val PREFS = "agra_catalog_prefs"
    private const val KEY_ROLES = "collaborator_roles"

    /** Puestos que se ofrecen mientras el teléfono nunca ha podido sincronizar */
    private val DEFAULT_ROLES = listOf(
        "Jornalero",
        "Encargado de riego",
        "Podador",
        "Cosechador",
        "Aplicador de agroquímicos",
        "Tractorista",
        "Supervisor de campo",
    )

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Puestos disponibles, ordenados alfabéticamente */
    fun roles(context: Context): List<String> {
        val stored = prefs(context).getStringSet(KEY_ROLES, null)
        val all = if (stored.isNullOrEmpty()) DEFAULT_ROLES else stored.toList()
        return all.filter { it.isNotBlank() }.sortedBy { it.lowercase() }
    }

    /** Reemplaza el catálogo con el del servidor, conservando los locales aún no subidos */
    fun setRolesFromServer(context: Context, serverRoles: List<String>) {
        if (serverRoles.isEmpty()) return
        val current = prefs(context).getStringSet(KEY_ROLES, null).orEmpty()
        // Unión: no se pierde un puesto capturado offline que todavía no sube
        val merged = (serverRoles + current).map { it.trim() }.filter { it.isNotBlank() }.toSet()
        prefs(context).edit().putStringSet(KEY_ROLES, merged).apply()
    }

    /** Agrega un puesto capturado a mano con la opción "Otro" */
    fun addRole(context: Context, role: String) {
        val name = role.trim()
        if (name.isBlank()) return
        val current = prefs(context).getStringSet(KEY_ROLES, null)?.toMutableSet()
            ?: DEFAULT_ROLES.toMutableSet()
        if (current.any { it.equals(name, ignoreCase = true) }) return
        current.add(name)
        prefs(context).edit().putStringSet(KEY_ROLES, current).apply()
    }
}
