import React, { Component } from 'react';
import { Input, Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { FormBuilder, localise, Validators } from '../../shared';
import {
    CheckboxList,
    MultiLanguageInput,
    CheckboxListWithReadOnly
} from '../../shared/FieldEditors';
import applicationDefaultImg from 'images/application_default.png';

const nameComp = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

const existingNameValidator = async (id, options, value, edit) => {
    const applications = Object.values(options.store.applicationStore.store);

    let names = applications.map(l => l.name);
    if (edit)
        names = names.filter(appName => appName !== options.store.applicationStore.store[id].name);

    const msg = options.msg;
    if (names.includes(value))
        throw new Error(msg('application_exists_error', { applicationName: value }));
};

const nameValidator = async (edit, id, options, value) => {
    await Validators.internalName(options, value);
    return existingNameValidator(id, options, value, edit);
};

@inject('store')
@localise('applications')
@withRouter //provides history prop
@observer
export class ApplicationForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showLink: false,
            configMode: false
        };
    }

    static getDerivedStateFromProps(props, state) {
        const { data } = props;
        if (data) {
            return {
                configMode: data.name === 'config'
            };
        }
    }

    async componentDidMount() {
        const { store } = this.props;
        await store.applicationStore.getAll();
        await store.layerStore.getAll();
        const showLink = await store.permissionStore.userCurrentlyHasPermission('layers');

        this.setState({
            showLink
        });
    }

    render() {
        if (!this.props.data) return null;
        const { formRef, msg, store, data } = this.props;
        const { showLink, configMode } = this.state;

        let overlaysInitialValues = [];
        let otherLayersInitialValues = [];

        if (!configMode) {
            store.layerStore.overlays.sort(nameComp).forEach(overlay => {
                const temp = {
                    label: overlay.name,
                    value: overlay.id,
                    read_only: false,
                    selected: false,
                    snap: false
                };
                if (overlay.datasource == 'myworld') temp.disabled = false;
                else temp.disabled = true;
                overlaysInitialValues.push(temp);
            });

            store.layerStore.other_layers.sort(nameComp).forEach(otherLayer => {
                const temp = {
                    label: otherLayer.name,
                    value: otherLayer.id,
                    read_only: false,
                    selected: false,
                    snap: false
                };
                if (otherLayer.datasource == 'myworld') temp.disabled = false;
                else temp.disabled = true;
                otherLayersInitialValues.push(temp);
            });
        }

        const formItemLayout = {
            labelCol: { span: 5 },
            wrapperCol: { span: 7 }
        };

        const fields = [
            {
                id: 'name',
                component: <Input disabled={configMode} className="input-small" />,
                rules: [
                    { required: true },
                    {
                        store: store,
                        msg,
                        validator: (...args) =>
                            nameValidator(this.props.edit, this.props.match.params.id, ...args)
                    }
                ]
            },
            {
                id: 'external_name',
                component: (
                    <MultiLanguageInput style={{ width: 300 }} className={'external_name'} />
                ),
                rules: [{ required: true, message: msg('input_blank_validation_msg') }]
            },
            {
                id: 'description',
                component: (
                    <MultiLanguageInput type="textarea" style={{ width: 500 }} autosize={true} />
                ),
                initialValue: null
            },
            ...(configMode
                ? []
                : [
                      {
                          id: 'javascript_file',
                          component: <Input />,
                          initialValue: 'main.standard.js'
                      },
                      {
                          id: 'for_online_app',
                          component: <Checkbox />,
                          valuePropName: 'checked',
                          initialValue: true
                      },
                      {
                          id: 'for_native_app',
                          component: <Checkbox />,
                          valuePropName: 'checked',
                          initialValue: true
                      }
                  ]),
            {
                id: 'icon_url',
                component: <Input />,
                initialValue: applicationDefaultImg
            },
            ...(configMode
                ? []
                : [
                      {
                          id: 'basemaps',
                          component: (
                              <CheckboxList
                                  options={store.layerStore.basemaps.sort(nameComp).map(item => {
                                      return { label: item.name, value: item.id };
                                  })}
                                  itemRepresents="layer"
                                  showLink={showLink}
                              />
                          ),
                          initialValue: []
                      },
                      {
                          id: 'overlays',
                          component: (
                              <CheckboxListWithReadOnly
                                  itemRepresents="layer"
                                  showLink={showLink}
                              />
                          ),
                          initialValue: overlaysInitialValues
                      },
                      {
                          id: 'other_layers',
                          component: (
                              <CheckboxListWithReadOnly
                                  itemRepresents="layer"
                                  showLink={showLink}
                              />
                          ),
                          initialValue: otherLayersInitialValues
                      }
                  ])
        ];
        return (
            <FormBuilder
                msg={msg}
                form={formRef}
                fields={fields}
                formItemLayout={formItemLayout}
                data={data}
            />
        );
    }

    onLayersChange(layers, type) {
        this.props.store.applicationStore.updateLayers(layers, type);
    }
}
