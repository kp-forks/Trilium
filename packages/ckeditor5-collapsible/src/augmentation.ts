import CollapsibleCommand from "./collapsiblecommand.js";
import CollapsibleEditing from "./collapsibleediting.js";
import CollapsibleUI from "./collapsibleui.js";
import type { Collapsible } from "./index.js";

declare module "ckeditor5" {
    interface PluginsMap {
        [Collapsible.pluginName]: Collapsible;
        [CollapsibleEditing.pluginName]: CollapsibleEditing;
        [CollapsibleUI.pluginName]: CollapsibleUI;
    }

    interface CommandsMap {
        collapsible: CollapsibleCommand;
    }
}
