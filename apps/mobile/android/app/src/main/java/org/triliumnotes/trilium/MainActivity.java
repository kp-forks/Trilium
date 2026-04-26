package org.triliumnotes.trilium;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Draw content behind the system bars (status bar, navigation bar)
        // so the WebView background shows through the transparent bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
