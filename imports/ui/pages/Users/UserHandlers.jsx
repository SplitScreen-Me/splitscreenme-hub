import React, { useState } from "react";
import {
  List,
  Avatar,
  Icon,
  Tabs,
  PageHeader,
  Alert,
  Typography,
  Divider,
  Descriptions,
  Card,
  Spin,
  AutoComplete,
  Tooltip
} from "antd";
import { Result, Button } from "antd";
import { withTracker } from "meteor/react-meteor-data";
import HandlersCollection from "../../../api/Handlers/Handlers";
import { Link } from "react-router-dom";
import Moment from "react-moment";
import counterFormatter from "../../../modules/counterFormatter";
import { Session } from "meteor/session";
import { withRouter } from "react-router";
import escapeRegExp from "../../../modules/regexescaper";

const { TabPane } = Tabs;
const { Title, Paragraph, Text } = Typography;
const IconText = ({ type, text, ...rest }) => (
  <span {...rest}>
    <Icon type={type} style={{ marginRight: 8 }} />
    {text}
  </span>
);
const { Meta } = Card;
const currentSearch = new ReactiveVar("");

function UserHandlers(props) {
  const [searched, setSearched] = useState([]);
  const onSearch = () => {
    setSearched([
      ...new Set(
        props.users.map(function(us) {
          return { value: `userid:${us._id}`, text: us.profile.username };
        })
      )
    ]);
  };

  const onChange = value => {
    // Weird trick...
    if (value.split("userid:").length > 1) {
      props.history.push(`/user/${value.split("userid:")[1]}`); // Really weird trick...
      currentSearch.set("");
    } else {
      currentSearch.set(value);
    }
  };

  return (
    <div>
      <Typography>
        <Title>Contributors</Title>
        <Paragraph>Search for contributors in our amazing community.</Paragraph>
      </Typography>
      <AutoComplete
        style={{ width: 350 }}
        value={currentSearch.get()}
        dataSource={currentSearch.get().length > 1 ? searched : []}
        onSearch={onSearch}
        onChange={onChange}
        placeholder="Search for contributors"
      />
      <Divider />
      {props.match.params.id ? (
        <Spin spinning={props.loading}>
          <PageHeader
            onBack={() => props.history.push("/user")}
            title={`${props.loading ? "Loading..." : props.userProfile.profile.username}`}
            subTitle="'s public profile"
          >
            <div className="content">
              <div className="main">
                <Descriptions title="Stats & informations">
                  <Descriptions.Item label="Published handlers count">
                    {props.loading ? 0 : props.handlers.length}
                  </Descriptions.Item>
                  <Descriptions.Item label="Published handlers hotness">
                    {props.loading
                      ? 0
                      : props.handlers.reduce((total, current) => total + current.stars, 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Published handlers downloads">
                    {props.loading
                      ? 0
                      : props.handlers.reduce((total, current) => total + current.downloadCount, 0)}
                  </Descriptions.Item>
                </Descriptions>
                <Divider />
                <Descriptions title="Contributions" />
                <List
                  size="small"
                  pagination={{
                    onChange: page => {
                    },
                    pageSize: 5
                  }}
                  dataSource={props.handlers}
                  footer={
                    <div>
                      <b>SplitScreen.Me</b> compatible handlers.
                    </div>
                  }
                  renderItem={item => (
                    <List.Item
                      key={item._id}
                      actions={[]}
                      extra={
                        <Link to={`/handler/${item._id}`}>
                          <Button type="primary">View handler</Button>
                        </Link>
                      }
                    >
                      <List.Item.Meta
                        title={
                          <div>
                            <img
                              height={130}
                              style={{ float: "left", marginRight: "50px" }}
                              alt="logo"
                              src={
                                item.gameCover !== "no_cover"
                                  ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                                  : "/no_image.jpg"
                              }
                            />
                            <div>
                              <Link to={`/handler/${item._id}`}>{item.title}</Link> <br />
                              <Text type="secondary" style={{ fontSize: "12px" }}>
                                {item.gameName}
                              </Text>
                              <br />
                              <span>
                                Last update{" "}
                                <Moment format="YYYY-MM-DD HH:mm">{item.updatedAt}</Moment>
                              </span>
                              <br />
                              <br />
                              {item.stars > 999 ? (
                                <Tooltip
                                  placement="bottomLeft"
                                  title={item.downloadCount}
                                  arrowPointAtCenter
                                >
                                  <Link to={`/handler/${item._id}`}>
                                    <IconText
                                      type="fire"
                                      text={counterFormatter(item.stars)}
                                      key="list-vertical-star-o"
                                    />
                                  </Link>
                                </Tooltip>
                              ) : (
                                <Link to={`/handler/${item._id}`}>
                                  <IconText
                                    type="fire"
                                    text={counterFormatter(item.stars)}
                                    key="list-vertical-star-o"
                                  />
                                </Link>
                              )}
                              {item.downloadCount > 999 ? (
                                <Tooltip
                                  placement="bottomLeft"
                                  title={item.downloadCount}
                                  arrowPointAtCenter
                                >
                                  <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                    <IconText
                                      type="download"
                                      text={counterFormatter(item.downloadCount)}
                                      key="list-vertical-download"
                                    />
                                  </Link>
                                </Tooltip>
                              ) : (
                                <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                  <IconText
                                    type="download"
                                    text={counterFormatter(item.downloadCount)}
                                    key="list-vertical-download"
                                  />
                                </Link>
                              )}
                              {item.commentCount > 999 ? (
                                <Tooltip
                                  placement="bottomLeft"
                                  title={item.commentCount}
                                  arrowPointAtCenter
                                >
                                  <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                    <IconText
                                      type="message"
                                      text={counterFormatter(item.commentCount)}
                                      key="list-vertical-message"
                                    />
                                  </Link>
                                </Tooltip>
                              ) : (
                                <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                  <IconText
                                    type="message"
                                    text={counterFormatter(item.commentCount)}
                                    key="list-vertical-message"
                                  />
                                </Link>
                              )}
                            </div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            </div>
          </PageHeader>
        </Spin>
      ) : (
        <div>
          <div>Aaron E Rexwinkle</div>
<div>Abstraction</div>
<div>Adam Gáborik</div>
<div>Adam Lotoszynski</div>
<div>Aleck Herrera</div>
<div>Alex from HR</div>
<div>Alex Kai</div>
<div>Alex Pangia</div>
<div>Alex Peterson</div>
<div>Alex The Consumer</div>
<div>Alger Libby</div>
<div>Alí Al-Qudah Galván</div>
<div>Alvin Chan</div>
<div>Andrei Vetu</div>
<div>Andrew Johnson</div>
<div>Austin Archibald</div>
<div>Avery Cross</div>
<div>Aydean Chen</div>
<div>Azivar Azivat</div>
<div>ben1101</div>
<div>Benjamin Bellisario</div>
<div>Bill Houle</div>
<div>Bob Petit</div>
<div>BorrowedBagel</div>
<div>Božo Škegro</div>
<div>Brandon </div>
<div>Brandon Maxwell</div>
<div>brazillian max</div>
<div>Brendan Albright</div>
<div>Brennan Proner</div>
<div>Brian Blythe</div>
<div>Bruno Belau</div>
<div>Bryan Tovar</div>
<div>C A</div>
<div>Cameron Dalton</div>
<div>CARLOS _V</div>
<div>Caspian van Buuren</div>
<div>CatherineSnow </div>
<div>Charlie Illingworth</div>
<div>Chris Suffern</div>
<div>Chris</div>
<div>Christian Röder</div>
<div>Christopher Robinson</div>
<div>Ciara</div>
<div>Claude Modderman</div>
<div>Clément Lavenu</div>
<div>Clifftonic Studios .</div>
<div>ColinsTNT</div>
<div>Coltennz</div>
<div>Dan Dubicki</div>
<div>Dan54321</div>
<div>Daniel gutierrez</div>
<div>DaNiEl H</div>
<div>Daniel Lindsay</div>
<div>Dario Le</div>
<div>Das Pete</div>
<div>David Estrella</div>
<div>Dayanandji</div>
<div>Demezhan Kazhkenov</div>
<div>Diego Rodriguez Correa</div>
<div>Diego Zegarra</div>
<div>Dilan </div>
<div>Dirk Vanbeveren</div>
<div>Distro Helena</div>
<div>DJVgaming</div>
<div>dmoni moni</div>
<div>Doge</div>
<div>Douglas Rutherford</div>
<div>dr.hudooken</div>
<div>Dr_Snickerdoodle</div>
<div>Dru Ducharme</div>
<div>Dylan Palmer</div>
<div>Edoardo Bugnano</div>
<div>El pug Gamer</div>
<div>Elias Sanchez</div>
<div>Eric Weston</div>
<div>Ethan Olsen</div>
<div>Ethan</div>
<div>EthanAHG</div>
<div>eudean</div>
<div>Excipial</div>
<div>ezetrex57</div>
<div>Fabian Marz</div>
<div>FacuBazzi </div>
<div>Florian Puschmann</div>
<div>Francine Smith</div>
<div>Francisco Velasquez</div>
<div>František Bébar</div>
<div>Frederik Hammer</div>
<div>Fritz Thompson</div>
<div>Garrett Severtson</div>
<div>goat scape</div>
<div>Gonzalo Toro Adrovez</div>
<div>Grebz</div>
<div>Gregory Robertson</div>
<div>Grinbeard</div>
<div>Guilherme Mendes</div>
<div>Hameesh</div>
<div>Hiram Levi</div>
<div>holden</div>
<div>Hyper XR</div>
<div>inRaz</div>
<div>Isaiah Nonya</div>
<div>Ismael L</div>
<div>izke goat</div>
<div>J Y</div>
<div>Jackson Bashford</div>
<div>Jacob Duke</div>
<div>Jake Wilson</div>
<div>jam bell</div>
<div>James Scott</div>
<div>James Starkes</div>
<div>Janko Mihelić</div>
<div>Jared</div>
<div>Jason Le</div>
<div>Jasper Wilde</div>
<div>Jay C</div>
<div>jdj b Pop</div>
<div>Jean Luc</div>
<div>Jeffrey Clement</div>
<div>Jeffy Moeman</div>
<div>Jeroen Malotaux</div>
<div>Jerry Lüer</div>
<div>Jhomer Pajarillo</div>
<div>Jlanzelot</div>
<div>Joel Pascual Peña</div>
<div>John Galiano</div>
<div>Jose</div>
<div>Julius Albers</div>
<div>Jussi Koski</div>
<div>justposted</div>
<div>Katrina Lenselink</div>
<div>Kaum</div>
<div>Keith L Simmons</div>
<div>Kennoley </div>
<div>Kennon Cheung</div>
<div>Kevin Krüger</div>
<div>Kila7</div>
<div>kira queen</div>
<div>KMC</div>
<div>KnuXles</div>
<div>Kyler Pankey</div>
<div>Lambda Vibes</div>
<div>Lennon Foster</div>
<div>levvi11</div>
<div>Logan Feece</div>
<div>Lucas Towers</div>
<div>Luis Baqueiro</div>
<div>Luke Bilyk</div>
<div>Marc Lemieux</div>
<div>Marioosh</div>
<div>Maroon</div>
<div>Martín García Dietrich</div>
<div>Marx</div>
<div>Matt </div>
<div>Matt Bull</div>
<div>Matt</div>
<div>max gonzalez</div>
<div>Maximilli</div>
<div>Michael Pham</div>
<div>Miguel Rocha</div>
<div>Misha</div>
<div>Mogeku</div>
<div>Moon__Shyne</div>
<div>Musicalen</div>
<div>Myralilth </div>
<div>naitas povilaitis</div>
<div>Nalss Fucfuc</div>
<div>nate33</div>
<div>Nick Renieris</div>
<div>Nihilistic Nerd</div>
<div>Nikolas Gardner</div>
<div>Nils Solheim</div>
<div>Nolan Locke</div>
<div>Norwin </div>
<div>ollymaster </div>
<div>Oscar Horsey</div>
<div>Pac Sound</div>
<div>Paul Ferrettini</div>
<div>Paul Lee</div>
<div>paul smith</div>
<div>Paul Swinburne</div>
<div>Paul</div>
<div>Paveion</div>
<div>Perron Wiley</div>
<div>Petter Le</div>
<div>Polofi</div>
<div>porkerpants</div>
<div>quood</div>
<div>rafciu12 </div>
<div>Retrospaceman</div>
<div>Riley Hales</div>
<div>rjwils </div>
<div>Rob Woods</div>
<div>Ryan M</div>
<div>Ryan Schaefer</div>
<div>Ryan</div>
<div>Saad Tariq</div>
<div>Samuel Bradley-smith</div>
<div>samuel silva</div>
<div>Sander Nõgu</div>
<div>Sarman Costa</div>
<div>Sebastian Zieliński</div>
<div>Sebastian</div>
<div>Seth Leavitt</div>
<div>Shahid Ilyas</div>
<div>Sheryar Ahmad</div>
<div>shoganai_ramen</div>
<div>Sinozara</div>
<div>Soothing Ruby</div>
<div>Sophia</div>
<div>Steven Huddleston</div>
<div>T0m7k</div>
<div>Tanya</div>
<div>Teagan </div>
<div>Ted Brownlow</div>
<div>telegangster</div>
<div>Telmo Lourenço</div>
<div>Tempus Craft</div>
<div>The end</div>
<div>Theforbidden Channel</div>
<div>Théophile Piffre</div>
<div>Thomas Glapa</div>
<div>Tiago Fernandes</div>
<div>Tim Garcia</div>
<div>tyritz</div>
<div>Vadim Pelau</div>
<div>Vibe Dude</div>
<div>Ville Kiuru</div>
<div>W.</div>
<div>wizza</div>
<div>Wooley </div>
<div>wunner</div>
<div>Yadiel Mendez</div>
<div>yamayama</div>
<div>yamiseth</div>
<div>Yang Sen</div>
<div>Yeskendir Amirkhan</div>
<div>Yockstar</div>
<div>Yuma Doi</div>
<div>Yztirf Snavelk</div>
<div>Zac Sanders</div>

        </div>
      )}
    </div>
  );
}

export default withRouter(
  withTracker(props => {
    const subscription = Meteor.subscribe("handlers.user", props.match.params.id);
    const subscriptionUser = Meteor.subscribe("users.getProfile", props.match.params.id);
    const subscriptionUserSearch = Meteor.subscribe("users.searchProfile", currentSearch.get());
    const user = Meteor.user();
    return {
      loading: !subscription.ready() || !subscriptionUser.ready(),
      user,
      handlers: HandlersCollection.find(
        { owner: props.match.params.id },
        {
          sort: { createdAt: -1 }
        }
      ).fetch(),
      users: Meteor.users
        .find(
          {
            "profile.username": {
              $regex: new RegExp(escapeRegExp(currentSearch.get())),
              $options: "gi"
            }
          },
          {
            limit: 10
          }
        )
        .fetch(),
      userProfile: Meteor.users.findOne(props.match.params.id)
    };
  })(UserHandlers)
);
