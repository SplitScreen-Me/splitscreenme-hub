import React, { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import { Meteor } from 'meteor/meteor';
import { Spin, Row, Col, Typography } from 'antd';

function DisplayStats(props) {
  const { handlerId } = props;
  const [stats, setStats] = useState({  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Meteor.call('handlersStats.findOne', handlerId, (error, response) => {
      if (error) {
        console.error(error);
      } else {
        setStats(response);
        setLoading(false);
      }
    });
  }, [handlerId]);

  const statsFormatted = stats?.statsDownloads?.map(stat => ([new Date(stat.date), stat.downloads])) || [];
  const annotationsFormatted = stats?.statsPackages?.map(stat => ({
    x: new Date(stat?.meta?.releaseDate).setSeconds(0) || new Date(),
    strokeDashArray: 0,
    borderColor: '#775DD0',
    label: {
      borderColor: '#775DD0',
      style: {
        color: '#fff',
        background: '#775DD0',
      },
      text: 'v' + stat?.meta?.handlerVersion,
    }
  })) || [];
  const chartInfos = {
    series: [
      {
        name: 'Downloads',
        data: statsFormatted,
      },
    ],
    options: {
      chart: {
        type: 'area',
        stacked: false,
        height: 350,
        zoom: {
          type: 'x',
          enabled: true,
          autoScaleYaxis: true,
        },
        toolbar: {
          autoSelected: 'zoom',
        },
      },
      annotations: {
        xaxis: annotationsFormatted,
      },
      dataLabels: {
        enabled: false,
      },
      markers: {
        size: 0,
      },
      title: {
        text: 'Downloads over time',
        align: 'left',
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          inverseColors: false,
          opacityFrom: 0.5,
          opacityTo: 0,
          stops: [0, 90, 100],
        },
      },
      yaxis: {
        labels: {
          formatter: function(val) {
            return val.toFixed(0);
          },
        },
        title: {
          text: 'Downloads',
        },
      },
      xaxis: {
        type: 'datetime',
      },
      tooltip: {
        shared: false,
        y: {
          formatter: function(val) {
            return val;
          },
        },
      },
    },
  };

  return (
    <Spin spinning={loading}>
      <Row gutter={48} style={{ margin: '50px' }}>
        <Col span={24}>
          <ReactApexChart
            options={chartInfos.options}
            series={chartInfos.series}
            type="area"
            height={350}
          />
        </Col>
      </Row>
    </Spin>
  );
}
export default DisplayStats;
