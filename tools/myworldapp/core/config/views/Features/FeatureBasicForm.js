import React, { Component } from 'react';
import { Input, Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise, DatasourceEditor, MultiLanguageInput } from '../../shared';
import { EditableFieldEditor } from './EditableFieldEditor';
import { AvailableFields } from './AvailableFields';
import { DropTarget } from 'react-dnd';

//Component for the Properties tab of the Layer editor
@inject('store')
@localise('features')
@observer
export class FeatureBasicForm extends Component {
    constructor(props) {
        super(props);
    }

    formRef = React.createRef(); //Creates a reference to the feature basic form to be used in the handleSave method

    componentDidMount() {
        this.props.onMount?.(this);
    }

    render() {
        const { msg, data, store, dsClass } = this.props; //form is an antd form that includes the data and api

        const layout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 }
        };

        const dsStore = store.datasourceStore.store;
        if (!Object.keys(dsStore).length) return null;

        const dsName = this.formRef.current?.getFieldValue('datasource');

        const dsDef = { ...dsStore[dsName] };
        const dsType = dsDef?.type;
        const {
            supportsFeatureUpdating,
            supportsTrackChanges,
            supportsVersioning,
            supportsGeomIndexing
        } = dsClass ?? {};
        const feature_name_title = data.datasource === 'myworld' ? 'name' : 'feature_type';
        //create field schema to pass to form builder
        const fields = [
            {
                id: 'datasource',
                component: <DatasourceEditor msg={msg} dsType={dsType} disabled={true} />,
                rules: [{ required: true }]
            },
            {
                id: 'name',
                label: msg(feature_name_title),
                component: <Input disabled={!data.isDuplicate} />,
                rules: [{ required: true }]
            },
            {
                id: 'geometry_type',
                component: <Input disabled={true} />
            },
            {
                id: 'external_name',
                component: <MultiLanguageInput style={{ width: 300 }} className={'external_name'} />
            },
            {
                id: 'title',
                component: <DropInputField dropField={this.addToTitle} />
            },
            {
                id: 'short_description',
                component: <DropInputField dropField={this.addToShortDescription} />
            },
            ...(supportsFeatureUpdating
                ? [
                      supportsTrackChanges && {
                          id: 'track_changes',
                          component: <Checkbox />,
                          valuePropName: 'checked',
                          initialValue: false
                      },
                      supportsVersioning && {
                          id: 'versioned',
                          component: <Checkbox />,
                          valuePropName: 'checked'
                      },
                      {
                          id: 'editable',
                          component: <EditableFieldEditor />,
                          valuePropName: 'editable',
                          initialValue: false
                      },
                      supportsGeomIndexing && {
                          id: 'geom_indexed',
                          component: <Checkbox />,
                          valuePropName: 'checked'
                      }
                  ]
                : [])
        ].filter(Boolean);

        this.pseudoFields = ['{display_name}'];
        return (
            <div style={{ position: 'relative' }} className="myw-form-view">
                <FormBuilder
                    msg={msg}
                    form={this.formRef}
                    data={data}
                    fields={fields}
                    formItemLayout={layout}
                    onValuesChange={this.onValuesChange}
                />
                <AvailableFields titleMsg={'drag_for_title'} extraFields={this.pseudoFields} />
            </div>
        );
    }

    onValuesChange = changedValues => {
        this.props.store.ddStore.modifyCurrent(changedValues);
    };

    addToTitle = (origVal, fieldName) => {
        const value = this.createValOnDrop(origVal, fieldName);
        this.props.modifyCurrent({ title: value });
    };

    addToShortDescription = (origVal, fieldName) => {
        const value = this.createValOnDrop(origVal, fieldName);
        this.props.modifyCurrent({ short_description: value });
    };

    /**
     * Create the value to show in the drop target after drag n drop occured
     */
    createValOnDrop(origVal, droppedText) {
        let fieldToAppend;

        if (this.pseudoFields.includes(droppedText)) {
            fieldToAppend = droppedText; //use the text as is
        } else {
            fieldToAppend = '[' + droppedText + ']'; //Add square parenthesis around the text
        }

        const systemLangs = this.props.store.settingsStore.languages;

        if (systemLangs.length > 1) {
            let valObj = {};
            try {
                valObj = origVal ? JSON.parse(origVal) : {};
            } catch (e) {
                //Convert value to a multilanguage obj
                valObj[systemLangs[0]] = origVal;
            }
            const lang = this.props.store.settingsStore.currentLang;
            if (valObj[lang]) {
                valObj[lang] = valObj[lang] + ' ' + fieldToAppend;
                return JSON.stringify(valObj);
            } else {
                valObj[lang] = fieldToAppend;
                return JSON.stringify(valObj);
            }
        } else {
            if (origVal) return origVal + ' ' + fieldToAppend;
            else return fieldToAppend;
        }
    }
}

const fieldTarget = {
    drop(props, monitor) {
        const fieldName = monitor.getItem().name;
        const hoverIndex = props.index;
        props.dropField(props.value, fieldName, hoverIndex);
    }
};

@DropTarget('fieldName', fieldTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
@inject('store')
@observer
class DropInputField extends Component {
    render() {
        return <MultiLanguageInput {...this.props} style={{ width: 500 }} />;
    }
}
