window.addEventListener('load', (event) => {
    // prepare variables
    const webDesignButton = document.getElementById('web-design-button')
    const frontendButton = document.getElementById('frontend-button')
    const backendButton = document.getElementById('backend-button')
    const cmsButton = document.getElementById('cms-button')
    const dbmsButton = document.getElementById('dbms-button')
    const awsButton = document.getElementById('aws-button')
    const pmButton = document.getElementById('pm-button')
    const toolingButton = document.getElementById('tooling-button')
    const operatingSystemButton = document.getElementById('operating-system-button')

    const webDesignDialog = document.getElementById('web-design-dialog')
    const frontendDialog = document.getElementById('frontend-dialog')
    const backendDialog = document.getElementById('backend-dialog')
    const cmsDialog = document.getElementById('cms-dialog')
    const dbmsDialog = document.getElementById('dbms-dialog')
    const awsDialog = document.getElementById('aws-dialog')
    const pmDialog = document.getElementById('pm-dialog')
    const toolingDialog = document.getElementById('tooling-dialog')
    const operatingSystemDialog = document.getElementById('operating-system-dialog')

    // events
    webDesignButton.addEventListener('click', function() {
        webDesignDialog.showModal()
    })

    frontendButton.addEventListener('click', function() {
        frontendDialog.showModal()
    })

    backendButton.addEventListener('click', function() {
        backendDialog.showModal()
    })

    cmsButton.addEventListener('click', function() {
        cmsDialog.showModal()
    })

    dbmsButton.addEventListener('click', function() {
        dbmsDialog.showModal()
    })

    awsButton.addEventListener('click', function() {
        awsDialog.showModal()
    })

    pmButton.addEventListener('click', function() {
        pmDialog.showModal()
    })

    toolingButton.addEventListener('click', function() {
        toolingDialog.showModal()
    })

    operatingSystemButton.addEventListener('click', function() {
        operatingSystemDialog.showModal()
    })
})