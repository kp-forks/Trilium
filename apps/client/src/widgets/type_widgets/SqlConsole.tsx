import SplitEditor from "./helpers/SplitEditor";
import { TypeWidgetProps } from "./type_widget";

export default function SqlConsole(props: TypeWidgetProps) {
    return (
        <SplitEditor
            noteType="code"
            {...props}
        />
    );
}
