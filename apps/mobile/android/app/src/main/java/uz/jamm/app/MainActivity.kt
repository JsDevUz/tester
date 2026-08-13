package uz.jamm.app

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Mobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // react-native-screens talab qiladi: Android OS jarayonni o'ldirib, keyin
  // (masalan foydalanuvchi ilovani ochganda) fragment state'ni avtomatik
  // tiklashga (restore) urinsa, ScreenStackFragment buzilgan holatga tushib
  // "Screen fragments should never be restored" xatosi bilan crash beradi.
  // savedInstanceState'ni null uzatish bu avtomatik restore'ni bloklaydi —
  // https://github.com/software-mansion/react-native-screens/issues/17#issuecomment-424704067
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
