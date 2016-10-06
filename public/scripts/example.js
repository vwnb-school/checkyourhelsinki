

var ModuleList = React.createClass({
  render: function() {
    var modules = this.props.data.map(function(module) {
      return (
        <Module title={module.title} data={module.data} type={module.type}>
        </Module>
      );
    });
    return (
      <div className="moduleList">
        {modules}
      </div>
    );
  }
});

var Module = React.createClass({
  rawMarkup: function() {
    var md = new Remarkable();
    var rawMarkup = md.render(this.props.children.toString());
    return { __html: rawMarkup };
  },

  render: function() {
    return (
      <section className="module">
        <h2>
          {this.props.title}
        </h2>
        {JSON.stringify(this.props.data)}
      </section>
    );
  }
});

var AddressForm = React.createClass({
  getInitialState: function() {
    return {address: ''};
  },
  handleAddressChange: function(e) {
    this.setState({address: e.target.value});
  },
  handleSubmit: function(e) {
    e.preventDefault();
    var address = this.state.address.trim();
    if (!address) {
      return;
    }
    this.props.onAddressSubmit({address: address});
    this.setState({address: ''});
  },
  render: function() {
    return (
      <form className="addressForm" onSubmit={this.handleSubmit}>
        <input
          type="text"
          placeholder="Address search"
          value={this.state.address}
          onChange={this.handleAddressChange}
        />
        <input type="submit" value="Post" />
      </form>
    );
  }
});

var ModuleWrap = React.createClass({
  handleAddressSubmit: function(data) {
    console.log(this.props);
    $.ajax({
      url: this.props.url,
      dataType: 'json',
      type: 'GET',
      data: data,
      success: function(data) {
        this.setState({data: data});
      }.bind(this),
      error: function(xhr, status, err) {
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  },
  getInitialState: function() {
    return {data: []};
  },
  render: function() {
    return (
      <div className="moduleBox">
        <AddressForm onAddressSubmit={this.handleAddressSubmit}  />
        <ModuleList data={this.state.data} />
      </div>
    );
  }
});


ReactDOM.render(
  <ModuleWrap url="/api" />,
  document.getElementById('content')
);
