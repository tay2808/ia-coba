package mx.cobaev.ia

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import java.io.File

/**
 * Localiza el "Model Pack" entregado con Play Asset Delivery (fast-follow).
 * Los archivos quedan sin comprimir en disco, por lo que llama.cpp puede
 * mapearlos directamente (mmap) sin duplicar el almacenamiento.
 * La app no descarga nada: la entrega la realiza Google Play al instalar.
 */
class ModelPackModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName() = "ModelPack"

  @ReactMethod
  fun getBundledModels(promise: Promise) {
    val files = Arguments.createArray()
    try {
      val manager = AssetPackManagerFactory.getInstance(reactApplicationContext)
      val location = manager.getPackLocation(PACK_NAME)
      val dir = location?.assetsPath()?.let { File(it, "models") }
      dir?.listFiles { f -> f.isFile && f.name.endsWith(".gguf", ignoreCase = true) }?.forEach {
        files.pushMap(Arguments.createMap().apply {
          putString("path", it.absolutePath)
          putString("name", it.name)
          putDouble("size", it.length().toDouble())
        })
      }
      promise.resolve(files)
    } catch (e: Exception) {
      // APK instalada fuera de Play Store: no hay asset packs, se usa el importador manual.
      promise.resolve(files)
    }
  }

  companion object {
    const val PACK_NAME = "model_pack"
  }
}
