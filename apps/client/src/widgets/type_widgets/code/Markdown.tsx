import SplitEditor from "../helpers/SplitEditor";
import { TypeWidgetProps } from "../type_widget";

export default function Markdown(props: TypeWidgetProps) {
    return (
        <SplitEditor
            noteType="code"
            {...props}
            previewContent={<div>Hello World</div>}
        />
    );
}
