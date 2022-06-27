import React from 'react';
import { Upload, Button, Icon, message, Form, notification, Input, Steps } from 'antd';
import Packages from '../../../api/Packages/Packages';
import { withRouter } from 'react-router';

const { Step } = Steps;
class AddPackage extends React.Component {
  state = {
    fileList: [],
    uploading: false,
    releaseDescription: '',
  };
  changeReleaseDescription = ({ target: { value } }) => {
    this.setState({ releaseDescription: value });
  };

  handleUpload = () => {
    const { fileList } = this.state;
    const formData = new FormData();
    fileList.forEach(file => {
      formData.append('files[]', file);
    });

    this.setState({
      uploading: true,
    });
    if (fileList && fileList[0]) {
      // We upload only one file, in case
      // multiple files were selected
      const upload = Packages.insert(
        {
          file: fileList[0],
          streams: 'dynamic',
          chunkSize: 'dynamic',
          meta: {
            releaseDescription: this.state.releaseDescription,
            handlerId: this.props.handlerId,
          },
        },
        false,
      );
      console.log(upload.config.fileId);
      upload.on('start', function() {
        console.log('upload started');
      });

      upload.on('end', (error, fileObj) => {
        if (error) {
          console.log(error);
          notification.error({ message: 'Error during upload', description: error.message });
        } else {
          Meteor.setTimeout(() => {
            Meteor.call('packages.findOne', upload.config.fileId, (err, res) => {
              if (err) {
                notification.error({ message: 'Error during upload', description: err.message });
                this.setState({
                  uploading: false,
                });
              } else {
                if (res) {
                  notification.success({
                    message: 'New version',
                    description: 'A new version for your handler has been released!',
                  });
                  console.log('File "' + fileObj.name + '" successfully uploaded');
                  this.setState({
                    fileList: [],
                    uploading: false,
                    releaseDescription: '',
                  });
                } else {
                  notification.error({
                    message: 'Error during upload',
                    description: 'Malformed archive. Must have a valid handler.js.',
                  });
                  this.setState({
                    uploading: false,
                  });
                }
              }
            });
          }, 1000);
        }
      });

      upload.start();
    }
  };
  handleChange = info => {
    let fileList = [...info.fileList];
    if (fileList.length > 1) {
      this.setState({ fileList: [fileList[1].originFileObj] });
    }
  };
  render() {
    const { uploading, fileList } = this.state;
    const props = {
      onRemove: file => {
        this.setState(state => {
          const index = state.fileList.indexOf(file);
          const newFileList = state.fileList.slice();
          newFileList.splice(index, 1);
          return {
            fileList: newFileList,
          };
        });
      },
      beforeUpload: file => {
        this.setState(state => ({
          fileList: [...state.fileList, file],
        }));
        return false;
      },
      fileList,
      onChange: this.handleChange,
    };

    return (
      <div>
        <h4>Release a new version</h4>
        <Steps direction="vertical" size="small" current={-1}>
          <Step
            title="Select your handler file"
            description={
              <Upload multiple={false} maxCount={1} accept=".nc,.zip" {...props}>
                <Button>
                  <Icon type="upload" /> Select File
                </Button>
              </Upload>
            }
          />
          <Step
            title="Provide a quick description for this new release"
            description={
              <Input
                type="text"
                placeholder="Short description"
                value={this.state.releaseDescription}
                onChange={this.changeReleaseDescription}
              />
            }
          />
          <Step
            title="Submit your new release"
            description={
              <Button
                type="primary"
                onClick={this.handleUpload}
                disabled={fileList.length === 0}
                loading={uploading}
                style={{ marginTop: 16 }}
              >
                {uploading ? 'Uploading' : 'Send'}
              </Button>
            }
          />
        </Steps>
      </div>
    );
  }
}

export default AddPackage;
