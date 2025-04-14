import React, { useEffect, useRef } from 'react';
import JSONEditor from 'jsoneditor';

//Component for the Features tab of the Layer editor
export const JSONEditorView = props => {
    const { value, onChange, form } = props;

    let editorRef = useRef(null);

    //----------------------------Side effects-----------------------------
    useEffect(() => {
        function onJSONChange() {
            try {
                jsoneditor.get();
                onChange(jsoneditor.getText());
            } catch (e) {
                form.validateFields();
            }
            onChange(jsoneditor.getText());
        }

        const options = {
            mode: 'code',
            modes: ['code', 'tree'],
            error: function (err) {
                alert(err.toString());
            },
            statusBar: false,
            onChange: onJSONChange
        };
        let jsoneditor = new JSONEditor(editorRef.current, options);
        if (value) {
            try {
                jsoneditor.set(JSON.parse(value));
            } catch (e) {
                console.log(e);
            }
        }
        return () => {
            if (jsoneditor) {
                jsoneditor.destroy();
            }
        };
    }, []);

    //----------------------------JSX-----------------------------
    return <div className="jsoneditor-container" ref={editorRef} />;
};
